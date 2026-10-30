"""População de Foz do Iguaçu (IBGE, API de agregados do SIDRA).

- Estimativas (tabela 6579): população residente em 1º de julho de cada ano,
  usadas pelo TCU nos fundos de participação. Não há estimativa nos anos de
  Censo nem em 2023.
- Censo 2022 (tabela 4709): população residente em 31 de julho de 2022.

As estimativas até 2021 eram projeções a partir do Censo 2010 e subestimavam
Foz (2021: 257.971; Censo 2022: 285.415). A quebra fica registrada em
NOTA_SERIE, para o frontend não tratar o salto como crescimento real.
"""

import logging
from dataclasses import dataclass
from datetime import date

import httpx
from sqlalchemy import Connection, select

from app.db import engine
from app.models import Fonte, NotaSerie, PeriodoReferencia, PopulacaoObservacao
from etl.carga import carregar_versionado, obter_ou_criar, registrar_falha, registrar_se_mudou
from etl.http import get_json
from etl.siconfi import ID_ENTE

log = logging.getLogger(__name__)

API = "https://servicodados.ibge.gov.br/api/v3/agregados"
DOC_ESTIMATIVAS = "https://www.ibge.gov.br/estatisticas/sociais/populacao/9103-estimativas-de-populacao.html"
DOC_CENSO = "https://www.ibge.gov.br/estatisticas/sociais/populacao/22827-censo-demografico-2022.html"


@dataclass(frozen=True)
class Serie:
    tipo: str  # estimativa | censo
    tabela: int
    variavel: int
    dataset: str
    documentacao: str

    def data_referencia(self, ano: int) -> date:
        return date(ano, 7, 31) if self.tipo == "censo" else date(ano, 7, 1)

    def metodologia(self, ano: int) -> str:
        if self.tipo == "censo":
            return f"Censo Demográfico {ano} (SIDRA {self.tabela})"
        base = "Censo 2010" if ano < 2022 else "Censo 2022"
        return f"Estimativa anual, base {base} (SIDRA {self.tabela})"


SERIES = [
    Serie("estimativa", 6579, 9324, "Estimativas de população", DOC_ESTIMATIVAS),
    Serie("censo", 4709, 93, "Censo 2022", DOC_CENSO),
]


def coletar_serie(http: httpx.Client, serie: Serie, desde: int, ate: int) -> None:
    periodos = [int(p["id"]) for p in get_json(http, f"{API}/{serie.tabela}/periodos", {})]
    anos = [a for a in periodos if desde <= a <= ate]
    if not anos:
        log.info("IBGE %s: nenhum período na janela", serie.dataset)
        return
    endpoint = f"{API}/{serie.tabela}/periodos/{'|'.join(map(str, anos))}/variaveis/{serie.variavel}"
    params = {"localidades": f"N6[{ID_ENTE}]"}
    with engine.begin() as conn:
        fonte_id = obter_ou_criar(
            conn, Fonte, ["sistema", "dataset"],
            orgao="IBGE", sistema="SIDRA", dataset=serie.dataset, url_documentacao=serie.documentacao,
        )
    try:
        resposta = get_json(http, endpoint, params)
        valores = resposta[0]["resultados"][0]["series"][0]["serie"]
        with engine.begin() as conn:
            coleta_id = registrar_se_mudou(
                conn, fonte_id, endpoint, params, [valores], (date(min(anos), 1, 1), date(max(anos), 12, 31))
            )
            if coleta_id is None:
                log.info("IBGE %s: sem mudanças (mesmo hash)", serie.dataset)
                return
            linhas = []
            for ano_txt, valor in valores.items():
                ano = int(ano_txt)
                if not valor.isdigit():  # "-", "..." etc.: sem dado, não é zero
                    log.warning("IBGE %s %d: valor não numérico %r", serie.dataset, ano, valor)
                    continue
                ref = serie.data_referencia(ano)
                periodo_id = obter_ou_criar(
                    conn, PeriodoReferencia, ["tipo_periodo", "data_inicio", "data_fim", "data_referencia"],
                    ano=ano, tipo_periodo="pontual", sequencia=None,
                    data_inicio=ref, data_fim=ref, data_referencia=ref,
                )
                linhas.append(dict(
                    municipio_ibge=ID_ENTE, quantidade=int(valor), tipo=serie.tipo,
                    periodo_id=periodo_id, metodologia_versao=serie.metodologia(ano),
                ))
            resumo = carregar_versionado(
                conn, PopulacaoObservacao.__table__, linhas, coleta_id,
                ["municipio_ibge", "periodo_id", "tipo"], {"municipio_ibge": ID_ENTE, "tipo": serie.tipo},
            )
        log.info("IBGE %s: %d anos; %s", serie.dataset, len(linhas), resumo)
    except Exception:
        with engine.begin() as conn:
            registrar_falha(conn, fonte_id, endpoint, params)
        raise


def registrar_quebra_censo_2022(conn: Connection) -> None:
    """Nota da quebra entre as estimativas base 2010 e o Censo 2022."""
    t = PeriodoReferencia.__table__.c
    periodo_id = conn.execute(
        select(t.id).where(t.tipo_periodo == "pontual", t.data_referencia == date(2022, 7, 31))
    ).scalar()
    if periodo_id is None:
        return  # Censo 2022 fora da janela
    descricao = (
        "População: as estimativas do IBGE até 2021 eram projeções a partir do Censo 2010 e "
        "subestimavam Foz do Iguaçu (2021: 257.971 habitantes; Censo 2022: 285.415). O salto "
        "entre 2021 e 2022 é revisão de base, não crescimento real; valores por habitante de "
        "antes e depois de 2022 não são diretamente comparáveis."
    )
    n = NotaSerie.__table__.c
    existe = conn.execute(
        select(n.id).where(n.municipio_ibge == ID_ENTE, n.periodo_inicio_id == periodo_id, n.tipo == "quebra")
    ).scalar()
    valores = dict(
        municipio_ibge=ID_ENTE, periodo_inicio_id=periodo_id, tipo="quebra", gravidade="informativa",
        descricao=descricao, fundamento_url=DOC_CENSO,
    )
    if existe is None:
        conn.execute(NotaSerie.__table__.insert().values(**valores))
    else:
        conn.execute(NotaSerie.__table__.update().where(n.id == existe).values(**valores))


def executar(http: httpx.Client, desde: int, ate: int) -> int:
    falhas = 0
    for serie in SERIES:
        try:
            coletar_serie(http, serie, desde, ate)
        except Exception:
            log.exception("IBGE %s: falha na coleta", serie.dataset)
            falhas += 1
    with engine.begin() as conn:
        registrar_quebra_censo_2022(conn)
    return falhas
