"""Registro de coletas, detecção de novidade por hash e carga versionada."""

import hashlib
import json
import os
import subprocess
from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import (
    BigInteger,
    Column,
    Connection,
    MetaData,
    Table,
    and_,
    exists,
    func,
    insert,
    literal,
    or_,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models import Coleta

COLUNAS_CONTROLE = {"id", "coleta_id", "valido_de", "valido_ate"}


def hash_conteudo(itens: list[dict[str, Any]]) -> str:
    """sha256 independente da ordem dos itens e das chaves."""
    linhas = sorted(json.dumps(i, sort_keys=True, ensure_ascii=False, default=str) for i in itens)
    return hashlib.sha256("\n".join(linhas).encode()).hexdigest()


def versao_ingestao() -> str:
    if sha := os.environ.get("GITHUB_SHA"):
        return sha
    try:
        return subprocess.run(
            ["git", "describe", "--always", "--dirty", "--abbrev=40"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "desconhecida"


def ultima_coleta(conn: Connection, fonte_id: int, endpoint: str, parametros: dict):
    """Última coleta bem-sucedida da mesma requisição (fonte + endpoint + parâmetros)."""
    c = Coleta.__table__.c
    return conn.execute(
        select(c.id, c.hash_conteudo, c.executada_em)
        .where(
            c.fonte_id == fonte_id,
            c.endpoint == endpoint,
            c.parametros_requisicao == parametros,
            c.status == "sucesso",
        )
        .order_by(c.executada_em.desc())
        .limit(1)
    ).first()


def registrar_se_mudou(
    conn: Connection,
    fonte_id: int,
    endpoint: str,
    parametros: dict,
    itens: list[dict],
    periodo_coberto: tuple[date, date],
) -> int | None:
    """Grava a coleta e devolve seu id, ou None se o conteúdo tem o mesmo hash
    da última coleta bem-sucedida (nada a fazer)."""
    hash_atual = hash_conteudo(itens)
    anterior = ultima_coleta(conn, fonte_id, endpoint, parametros)
    if anterior is not None and anterior.hash_conteudo == hash_atual:
        return None
    return conn.execute(
        insert(Coleta).returning(Coleta.id),
        dict(
            fonte_id=fonte_id,
            endpoint=endpoint,
            parametros_requisicao=parametros,
            hash_conteudo=hash_atual,
            periodo_coberto_inicio=periodo_coberto[0],
            periodo_coberto_fim=periodo_coberto[1],
            versao_ingestao=versao_ingestao(),
            status="sucesso",
        ),
    ).scalar_one()


def registrar_falha(conn: Connection, fonte_id: int, endpoint: str, parametros: dict) -> None:
    conn.execute(
        insert(Coleta),
        dict(
            fonte_id=fonte_id,
            endpoint=endpoint,
            parametros_requisicao=parametros,
            versao_ingestao=versao_ingestao(),
            status="falha",
        ),
    )


def obter_ou_criar(conn: Connection, modelo, chave: list[str], **valores) -> int:
    """id da linha com a chave natural dada, inserindo-a se não existir."""
    t = modelo.__table__
    novo = conn.execute(
        pg_insert(t).values(**valores).on_conflict_do_nothing().returning(t.c.id)
    ).scalar()
    if novo is not None:
        return novo
    return conn.execute(
        select(t.c.id).where(*[t.c[k].is_not_distinct_from(valores[k]) for k in chave])
    ).scalar_one()


@dataclass
class ResumoCarga:
    inseridas: int  # linhas novas + novas versões de linhas alteradas
    alteradas: int  # versões encerradas porque o valor mudou
    removidas: int  # versões encerradas porque a linha sumiu da fonte

    def __str__(self) -> str:
        return f"{self.inseridas} versões inseridas, {self.alteradas} alteradas, {self.removidas} removidas"


def carregar_versionado(
    conn: Connection,
    tabela: Table,
    linhas: list[dict],
    coleta_id: int,
    chaves: list[str],
    escopo: dict[str, Any],
) -> ResumoCarga:
    """Carga de tabela com DadoBruto (valido_de/valido_ate), sem sobrescrever nada.

    - linha nova: inserida;
    - linha com algum valor diferente: versão atual encerrada e nova inserida;
    - linha igual: intocada (rodar duas vezes não muda nada);
    - linha vigente dentro de `escopo` que não veio na carga: versão encerrada.

    `escopo` deve descrever exatamente o que a requisição cobre (ex.: um
    relatório), senão linhas de fora dela seriam dadas como removidas.
    """
    dados = [c for c in tabela.c if c.name not in COLUNAS_CONTROLE and c.computed is None]
    tmp = Table(
        f"tmp_{tabela.name}",
        MetaData(),
        *[Column(c.name, c.type) for c in dados],
        prefixes=["TEMPORARY"],
        postgresql_on_commit="DROP",
    )
    tmp.create(conn)
    conn.execute(insert(tmp), linhas)

    t = tabela
    vigente = t.c.valido_ate.is_(None)
    # "=" sempre que possível: IS NOT DISTINCT FROM impede índice e hash join
    mesma_chave = and_(*[
        t.c[k].is_not_distinct_from(tmp.c[k]) if t.c[k].nullable else t.c[k] == tmp.c[k]
        for k in chaves
    ])
    diferente = or_(*[t.c[c.name].is_distinct_from(tmp.c[c.name]) for c in dados if c.name not in chaves])
    no_escopo = [t.c[k].is_(None) if v is None else t.c[k] == v for k, v in escopo.items()]

    alteradas = conn.execute(
        update(t).where(vigente, mesma_chave, diferente).values(valido_ate=func.now())
    ).rowcount
    removidas = conn.execute(
        update(t)
        .where(vigente, *no_escopo, ~exists().where(mesma_chave))
        .values(valido_ate=func.now())
    ).rowcount
    # rowcount não é confiável em INSERT ... SELECT; conta pelo RETURNING
    inseridas = len(conn.execute(
        pg_insert(t)
        .from_select(
            [c.name for c in dados] + ["coleta_id"],
            select(*tmp.c, literal(coleta_id, BigInteger)),
        )
        .on_conflict_do_nothing(index_elements=chaves, index_where=vigente)
        .returning(t.c.id)
    ).all())
    return ResumoCarga(inseridas, alteradas, removidas)
