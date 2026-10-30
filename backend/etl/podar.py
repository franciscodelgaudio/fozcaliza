"""Apaga do banco o que ficou fora da janela de gestões (etl/janela.py).

Linhas são escolhidas pelo período a que se referem: tabelas com periodo_id
(pelo ano do período) e tabelas listadas em POR_EXERCICIO (pela coluna de
ano). Depois saem coletas e períodos antigos que nada mais referencia.
Todas as versões saem, não só a vigente.
"""

import logging
from datetime import date

from sqlalchemy import Connection, Table, and_, delete, exists, select

from app.models import Base, Coleta, PeriodoReferencia

log = logging.getLogger(__name__)

# tabelas sem periodo_id, com a coluna que dá o exercício da linha
POR_EXERCICIO = {
    "siconfi_linha": "exercicio",
    **{t: "ano" for t in ("empenho", "empenho_movimento", "contrato", "contrato_aditivo", "licitacao", "vinculo")},
}


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


def podar(conn: Connection, primeiro_exercicio: int) -> dict[str, int]:
    periodo = PeriodoReferencia.__table__
    coleta = Coleta.__table__
    antigos = select(periodo.c.id).where(periodo.c.ano < primeiro_exercicio)
    apagadas = {}

    for t, coluna in _referencias(periodo):
        if coluna == "periodo_id":
            apagadas[t.name] = conn.execute(delete(t).where(t.c.periodo_id.in_(antigos))).rowcount
    for nome, coluna in POR_EXERCICIO.items():
        t = Base.metadata.tables[nome]
        apagadas[nome] = conn.execute(delete(t).where(t.c[coluna] < primeiro_exercicio)).rowcount

    apagadas["coleta"] = conn.execute(
        delete(coleta).where(
            coleta.c.periodo_coberto_fim < date(primeiro_exercicio, 1, 1), _nao_referenciado(coleta)
        )
    ).rowcount
    apagadas["periodo_referencia"] = conn.execute(
        delete(periodo).where(periodo.c.ano < primeiro_exercicio, _nao_referenciado(periodo))
    ).rowcount

    apagadas = {k: v for k, v in apagadas.items() if v}
    log.info("fora da janela (antes de %d): %s", primeiro_exercicio, apagadas or "nada a apagar")
    return apagadas
