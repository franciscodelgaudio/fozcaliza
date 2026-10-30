"""Apaga do banco o que ficou fora das janelas de gestões (etl/janela.py).

Linhas são escolhidas pelo período a que se referem: tabelas com periodo_id
(pelo ano do período) e tabelas listadas em POR_EXERCICIO e DETALHE (pela
coluna de ano), cada grupo com a sua janela. Depois saem coletas e períodos
antigos que nada mais referencia. Todas as versões saem, não só a vigente.
"""

import logging
from datetime import date

from sqlalchemy import Connection, Table, and_, delete, exists, select

from app.models import Base, Coleta, PeriodoReferencia

log = logging.getLogger(__name__)

# tabelas sem periodo_id, com a coluna que dá o exercício da linha
POR_EXERCICIO = {"siconfi_linha": "exercicio", "obra": "ano", "obra_local": "ano"}
# detalhe do TCE-PR: só a gestão atual
DETALHE = {t: "ano" for t in ("empenho", "empenho_movimento", "contrato", "contrato_aditivo", "licitacao", "vinculo")}


def _referencias(alvo: Table) -> list[tuple[Table, str]]:
    return [
        (t, fk.parent.name)
        for t in Base.metadata.sorted_tables
        for fk in t.foreign_keys
        if fk.column.table is alvo
    ]


def _nao_referenciado(alvo: Table):
    return and_(*[
        ~exists().where(t.c[coluna] == alvo.c.id) for t, coluna in _referencias(alvo)
    ])


def podar(conn: Connection, primeiro_exercicio: int, primeiro_exercicio_detalhe: int) -> dict[str, int]:
    periodo = PeriodoReferencia.__table__
    coleta = Coleta.__table__
    antigos = select(periodo.c.id).where(periodo.c.ano < primeiro_exercicio)
    apagadas = {}

    for t, coluna in _referencias(periodo):
        if coluna == "periodo_id":
            apagadas[t.name] = conn.execute(delete(t).where(t.c.periodo_id.in_(antigos))).rowcount
    for tabelas, inicio in ((POR_EXERCICIO, primeiro_exercicio), (DETALHE, primeiro_exercicio_detalhe)):
        for nome, coluna in tabelas.items():
            t = Base.metadata.tables[nome]
            apagadas[nome] = conn.execute(delete(t).where(t.c[coluna] < inicio)).rowcount

    # coletas seguem a janela geral: dentro dela, a última coleta de cada
    # requisição guarda o hash que evita baixar de novo o que não mudou
    apagadas["coleta"] = conn.execute(
        delete(coleta).where(
            coleta.c.periodo_coberto_fim < date(primeiro_exercicio, 1, 1), _nao_referenciado(coleta)
        )
    ).rowcount
    apagadas["periodo_referencia"] = conn.execute(
        delete(periodo).where(periodo.c.ano < primeiro_exercicio, _nao_referenciado(periodo))
    ).rowcount

    apagadas = {k: v for k, v in apagadas.items() if v}
    log.info(
        "fora das janelas (geral antes de %d, detalhe antes de %d): %s",
        primeiro_exercicio, primeiro_exercicio_detalhe, apagadas or "nada a apagar",
    )
    return apagadas
