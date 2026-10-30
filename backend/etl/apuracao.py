"""APURACAO_OFICIAL: limites e mínimos como apurados pelas fontes oficiais.

Duas fontes, nunca misturadas (fonte_id distingue):
- RGF (Siconfi), por quadrimestre: RCL, despesa com pessoal por poder e
  dívida consolidada líquida. Usa só a coluna do próprio quadrimestre de
  cada relatório (relatórios seguintes repetem quadrimestres anteriores).
- Painel de Entidades do PIT/TCE-PR, por exercício fechado: RCL, pessoal do
  município consolidado, dívida, e os mínimos de educação (MDE) e saúde
  (ASPS), que o Siconfi não traz para Foz.

Períodos: RCL e pessoal somam os 12 meses encerrados no fim do quadrimestre
(no 3º, o próprio exercício); dívida é o saldo no fim do quadrimestre;
MDE e ASPS, o exercício.
"""

import calendar
import logging
from datetime import date

from sqlalchemy import Connection, select

from app.models import ApuracaoOficial, PeriodoReferencia, SiconfiLinha
from etl.carga import ResumoCarga, carregar_versionado, obter_ou_criar
from etl.classificacao import normalizar
from etl.siconfi import ID_ENTE

log = logging.getLogger(__name__)

PODER = {"E": "executivo", "L": "legislativo"}
BASE_LEGAL = {
    "RCL": "LRF, art. 2º, IV",
    ("DTP", "executivo"): "LRF, art. 20, III, b",
    ("DTP", "legislativo"): "LRF, art. 20, III, a",
    ("DTP", "consolidado"): "LRF, art. 19, III",
    "DCL": "Resolução do Senado Federal 40/2001, art. 3º, II",
    "MDE": "Constituição Federal, art. 212",
    "ASPS": "Lei Complementar 141/2012, art. 7º",
}
LIMITE_DCL = 120  # % da RCL ajustada
METODO_RGF = "Relatório de Gestão Fiscal (Siconfi), Anexo {anexo}, {q}º quadrimestre, poder {poder}"
CHAVES = ["municipio_ibge", "periodo_id", "fonte_id", "poder", "item"]


def fim_do_mes(ano: int, mes: int) -> date:
    return date(ano, mes, calendar.monthrange(ano, mes)[1])


def periodo_12_meses(conn: Connection, exercicio: int, quadrimestre: int) -> int:
    fim = fim_do_mes(exercicio, 4 * quadrimestre)
    # 1º dia do mês seguinte ao do fim, um ano antes: Q1/2025 = mai/2024 a abr/2025
    inicio = date(fim.year, 1, 1) if fim.month == 12 else date(fim.year - 1, fim.month + 1, 1)
    return obter_ou_criar(
        conn, PeriodoReferencia, ["tipo_periodo", "data_inicio", "data_fim", "data_referencia"],
        ano=exercicio, tipo_periodo="quadrimestral", sequencia=quadrimestre,
        data_inicio=inicio, data_fim=fim, data_referencia=None,
    )


def periodo_saldo(conn: Connection, dia: date) -> int:
    return obter_ou_criar(
        conn, PeriodoReferencia, ["tipo_periodo", "data_inicio", "data_fim", "data_referencia"],
        ano=dia.year, tipo_periodo="pontual", sequencia=None, data_inicio=dia, data_fim=dia, data_referencia=dia,
    )


def periodo_exercicio(conn: Connection, exercicio: int) -> int:
    return obter_ou_criar(
        conn, PeriodoReferencia, ["tipo_periodo", "data_inicio", "data_fim", "data_referencia"],
        ano=exercicio, tipo_periodo="anual", sequencia=None,
        data_inicio=date(exercicio, 1, 1), data_fim=date(exercicio, 12, 31), data_referencia=None,
    )


def _primeira(linhas, prefixo: str, coluna: str):
    """Valor e coleta da primeira linha cuja conta normalizada começa com o prefixo."""
    for r in linhas:
        if normalizar(r.conta).startswith(prefixo) and normalizar(r.coluna) == normalizar(coluna):
            return r
    return None


def apuracoes_rgf(conn: Connection, fonte_rgf: int) -> list[dict]:
    t = SiconfiLinha.__table__.c
    linhas = conn.execute(
        select(t.exercicio, t.periodo, t.co_poder, t.anexo, t.conta, t.coluna, t.valor, t.coleta_id)
        .where(t.municipio_ibge == ID_ENTE, t.demonstrativo == "RGF", t.valido_ate.is_(None),
               t.anexo.in_(["RGF-Anexo 01", "RGF-Anexo 02"]))
        .order_by(t.exercicio, t.periodo, t.co_poder, t.anexo, t.ordem)
    ).all()
    relatorios: dict[tuple, list] = {}
    for r in linhas:
        relatorios.setdefault((r.exercicio, r.periodo, r.co_poder, r.anexo), []).append(r)

    saida = []
    for (exercicio, q, co_poder, anexo), rs in relatorios.items():
        poder = PODER[co_poder]
        metodo = METODO_RGF.format(anexo=anexo[-2:].lstrip("0"), q=q, poder=poder)
        if anexo == "RGF-Anexo 01":
            dtp = _primeira(rs, "despesatotalcompessoaldtp", "Valor")
            pct = _primeira(rs, "despesatotalcompessoaldtp", "% sobre a RCL Ajustada")
            rcl_ajustada = _primeira(rs, "receitacorrenteliquidaajustada", "Valor")
            limite = _primeira(rs, "limitemaximo", "% sobre a RCL Ajustada")
            if not (dtp and pct and rcl_ajustada and limite):
                raise ValueError(f"RGF {exercicio} Q{q} {poder}: Anexo 1 sem DTP/RCL ajustada/limite")
            periodo_id = periodo_12_meses(conn, exercicio, q)
            saida.append(dict(
                periodo_id=periodo_id, fonte_id=fonte_rgf, poder=poder, item="DTP",
                numerador=dtp.valor, denominador=rcl_ajustada.valor, percentual_apurado=pct.valor,
                limite_ou_minimo=limite.valor, base_legal=BASE_LEGAL[("DTP", poder)],
                metodologia_apuracao=metodo, coleta_id=dtp.coleta_id,
            ))
            if co_poder == "E":  # a RCL é do município; vem igual nos dois RGFs
                rcl = _primeira(rs, "receitacorrenteliquidarcl", "Valor")
                if rcl is None:
                    raise ValueError(f"RGF {exercicio} Q{q}: Anexo 1 sem RCL")
                saida.append(dict(
                    periodo_id=periodo_id, fonte_id=fonte_rgf, poder="consolidado", item="RCL",
                    numerador=rcl.valor, denominador=None, percentual_apurado=None, limite_ou_minimo=None,
                    base_legal=BASE_LEGAL["RCL"], metodologia_apuracao=metodo, coleta_id=rcl.coleta_id,
                ))
        elif co_poder == "E":  # dívida consolidada: só no RGF do Executivo
            coluna = f"Até o {q}º Quadrimestre"
            dcl = _primeira(rs, "dividaconsolidadaliquidadcl", coluna)
            pct = _primeira(rs, "dadclsobrearcl", coluna)
            base = _primeira(rs, "receitacorrenteliquidaajustada", coluna) or _primeira(rs, "receitacorrenteliquidarcl", coluna)
            if not (dcl and pct and base):
                raise ValueError(f"RGF {exercicio} Q{q}: Anexo 2 sem DCL/%/RCL na coluna {coluna!r}")
            saida.append(dict(
                periodo_id=periodo_saldo(conn, fim_do_mes(exercicio, 4 * q)), fonte_id=fonte_rgf,
                poder="consolidado", item="DCL", numerador=dcl.valor, denominador=base.valor,
                percentual_apurado=pct.valor, limite_ou_minimo=LIMITE_DCL, base_legal=BASE_LEGAL["DCL"],
                metodologia_apuracao=metodo, coleta_id=dcl.coleta_id,
            ))
    return saida


def transformar_rgf(conn: Connection, fonte_rgf: int) -> ResumoCarga:
    linhas = [{"municipio_ibge": ID_ENTE, **l} for l in apuracoes_rgf(conn, fonte_rgf)]
    resumo = carregar_versionado(
        conn, ApuracaoOficial.__table__, linhas, None, CHAVES, {"municipio_ibge": ID_ENTE, "fonte_id": fonte_rgf}
    )
    log.info("APURACAO_OFICIAL RGF: %d linhas; %s", len(linhas), resumo)
    return resumo
