"""Painel de Entidades do PIT/TCE-PR: apurações do município consolidado.

Não é arquivo de dados abertos: é a página que o portal monta para cada
entidade e exercício (POST em /Entidade/EntidadeConsulta/Consulta). Por isso
a leitura é estrita: cada rótulo precisa estar lá, e só exercícios fechados
("Informações consolidadas até o mês 12") são aceitos; no exercício corrente
o painel mistura meses diferentes sem dizer qual número é de qual.

Vira APURACAO_OFICIAL com fonte própria (TCE-PR), ao lado da do RGF:
RCL, pessoal do município consolidado, dívida consolidada líquida, e os
mínimos de educação (MDE) e saúde (ASPS). O critério do TCE-PR pode diferir
do RGF (ex.: pessoal), então as duas fontes nunca são somadas.
"""

import html
import logging
import re
from datetime import date
from decimal import Decimal

import httpx
from sqlalchemy import Connection, select

from app.db import engine
from app.models import ApuracaoOficial, Fonte
from etl.apuracao import (
    BASE_LEGAL,
    CHAVES,
    LIMITE_DCL,
    periodo_12_meses,
    periodo_exercicio,
    periodo_saldo,
)
from etl.carga import ResumoCarga, carregar_versionado, obter_ou_criar, registrar_falha, registrar_se_mudou
from etl.http import requisitar
from etl.siconfi import ID_ENTE

log = logging.getLogger(__name__)

URL = "https://pit.tce.pr.gov.br/Entidade/EntidadeConsulta/Consulta"
DOC_URL = "https://pit.tce.pr.gov.br/Entidade"
ID_MUNICIPIO_TCE = 2359  # Foz do Iguaçu no PIT
ID_PESSOA_MUNICIPIO = 12294
METODO = "Painel de Entidades do PIT/TCE-PR, consolidado do município, exercício fechado"

ROTULOS = {
    "rcl": "Receita Corrente Líquida - RCL",
    "dcl": "Dívida Consolidada Líquida",
    "rcl_endividamento": "RCL Ajustada para Endividamento *",
    "rcl_pessoal": "RCL Ajustada para Pessoal **",
    "pessoal": "Despesa de Pessoal",
    "base_educacao": "Base de Cálculo Educação",
    "educacao": "Aplicado em Educação",
    "base_saude": "Base de Cálculo Saúde",
    "saude": "Aplicado em Saúde",
}
COM_PERCENTUAL = {"dcl", "pessoal", "educacao", "saude"}
# a RCL ajustada para endividamento só aparece a partir de 2020; antes, o
# percentual da dívida é sobre a RCL
OPCIONAIS = {"rcl_endividamento"}


def numero(texto: str) -> Decimal:
    """'R$1.917.943,05' / '53,14% da RCL' / '25,03%' -> Decimal."""
    m = re.search(r"-?[\d.]+,\d+|-?\d+", texto)
    if not m:
        raise ValueError(f"sem número em {texto!r}")
    return Decimal(m.group().replace(".", "").replace(",", "."))


def ler_painel(pagina: str) -> dict[str, Decimal] | None:
    """Valores do bloco 'Consolidado Município', ou None se o exercício não fechou."""
    pagina = re.sub(r"(?s)<script.*?</script>|<style.*?</style>", "", pagina)
    tokens = [t for t in (re.sub(r"\s+", " ", html.unescape(x)).strip() for x in re.split(r"<[^>]+>", pagina)) if t]
    inicio = tokens.index("Consolidado Município")
    bloco = tokens[inicio:]
    meses = [t for t in bloco if t.startswith("Informações consolidadas até o mês")]
    if not meses:
        raise ValueError("painel sem 'Informações consolidadas até o mês'")
    if numero(meses[0]) != 12:
        return None
    valores = {}
    for chave, rotulo in ROTULOS.items():
        if rotulo not in bloco:
            if chave in OPCIONAIS:
                continue
            raise ValueError(f"painel sem o rótulo {rotulo!r}")
        i = bloco.index(rotulo)  # primeira ocorrência; as notas de rodapé vêm depois
        valores[chave] = numero(bloco[i + 1])
        if chave in COM_PERCENTUAL:
            if "%" not in bloco[i + 2]:
                raise ValueError(f"{rotulo}: percentual esperado depois do valor, veio {bloco[i + 2]!r}")
            valores[f"{chave}_pct"] = numero(bloco[i + 2])
    return valores


def linhas_apuracao(conn, valores: dict[str, Decimal], ano: int, fonte_id: int, coleta_id: int) -> list[dict]:
    doze_meses = periodo_12_meses(conn, ano, 3)

    def linha(item, poder, periodo_id, numerador, denominador, pct, limite, base_legal):
        return dict(
            municipio_ibge=ID_ENTE, periodo_id=periodo_id, fonte_id=fonte_id, poder=poder, item=item,
            numerador=numerador, denominador=denominador, percentual_apurado=pct, limite_ou_minimo=limite,
            base_legal=base_legal, metodologia_apuracao=METODO, coleta_id=coleta_id,
        )

    v = valores
    exercicio = periodo_exercicio(conn, ano)
    return [
        linha("RCL", "consolidado", doze_meses, v["rcl"], None, None, None, BASE_LEGAL["RCL"]),
        linha("DTP", "consolidado", doze_meses, v["pessoal"], v["rcl_pessoal"], v["pessoal_pct"], 60,
              BASE_LEGAL[("DTP", "consolidado")]),
        linha("DCL", "consolidado", periodo_saldo(conn, date(ano, 12, 31)), v["dcl"], v.get("rcl_endividamento", v["rcl"]),
              v["dcl_pct"], LIMITE_DCL, BASE_LEGAL["DCL"]),
        linha("MDE", "consolidado", exercicio, v["educacao"], v["base_educacao"], v["educacao_pct"], 25,
              BASE_LEGAL["MDE"]),
        linha("ASPS", "consolidado", exercicio, v["saude"], v["base_saude"], v["saude_pct"], 15,
              BASE_LEGAL["ASPS"]),
    ]


def rcl_do_rgf(conn: Connection, ano: int) -> Decimal | None:
    """RCL do RGF do 3º quadrimestre, para conferir a do painel."""
    t = ApuracaoOficial.__table__.c
    f = Fonte.__table__.c
    return conn.execute(
        select(t.numerador).join_from(ApuracaoOficial.__table__, Fonte.__table__, t.fonte_id == f.id)
        .where(t.valido_ate.is_(None), t.item == "RCL", f.sistema == "Siconfi",
               t.periodo_id == periodo_12_meses(conn, ano, 3))
    ).scalar()


def coletar(http: httpx.Client, ano: int) -> None:
    params = {"idMunicipio": ID_MUNICIPIO_TCE, "idPessoa": ID_PESSOA_MUNICIPIO, "nrAno": ano}
    with engine.begin() as conn:
        fonte_id = obter_ou_criar(
            conn, Fonte, ["sistema", "dataset"],
            orgao="TCE-PR", sistema="PIT", dataset="Painel de Entidades", url_documentacao=DOC_URL,
        )
    try:
        resposta = requisitar(http, "POST", URL, data=params)
        valores = ler_painel(resposta.text)
        if valores is None:
            log.info("TCE painel %d: exercício ainda não consolidado até dezembro", ano)
            return
        with engine.begin() as conn:
            coleta_id = registrar_se_mudou(
                conn, fonte_id, URL, params, [{k: str(v) for k, v in valores.items()}],
                (date(ano, 1, 1), date(ano, 12, 31)),
            )
            if coleta_id is None:
                log.info("TCE painel %d: sem mudanças (mesmo hash)", ano)
                return
            linhas = linhas_apuracao(conn, valores, ano, fonte_id, coleta_id)
            # um ano ocupa três períodos (12 meses, saldo em 31/12, exercício):
            # cada um é carregado com o próprio escopo
            resumo = ResumoCarga(0, 0, 0)
            for periodo_id in sorted({l["periodo_id"] for l in linhas}):
                r = carregar_versionado(
                    conn, ApuracaoOficial.__table__, [l for l in linhas if l["periodo_id"] == periodo_id],
                    None, CHAVES, {"municipio_ibge": ID_ENTE, "fonte_id": fonte_id, "periodo_id": periodo_id},
                )
                resumo = ResumoCarga(resumo.inseridas + r.inseridas, resumo.alteradas + r.alteradas,
                                     resumo.removidas + r.removidas)
            rcl_rgf = rcl_do_rgf(conn, ano)
            if rcl_rgf is not None and rcl_rgf != valores["rcl"]:
                log.warning("TCE painel %d: RCL %s difere da do RGF (%s)", ano, valores["rcl"], rcl_rgf)
        log.info("TCE painel %d: %s", ano, resumo)
    except Exception:
        with engine.begin() as conn:
            registrar_falha(conn, fonte_id, URL, params)
        raise


def executar(http: httpx.Client, desde: int, ate: int) -> int:
    falhas = 0
    for ano in range(desde, ate + 1):
        try:
            coletar(http, ano)
        except Exception:
            log.exception("TCE painel %d: falha na coleta", ano)
            falhas += 1
    return falhas
