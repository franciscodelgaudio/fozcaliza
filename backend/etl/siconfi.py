"""Coletor do Siconfi (API de dados abertos do Tesouro Nacional).

Fluxo incremental por exercício:
1. Baixa o extrato de entregas (uma requisição). Se o hash não mudou desde a
   última coleta, não grava nada; senão, atualiza ENTREGA_DEMONSTRATIVO.
2. Para cada RREO/RGF/DCA do extrato, baixa o relatório só se ele nunca foi
   coletado ou se mudou de status (entrega, homologação, retificação) há menos
   de JANELA_REVERIFICACAO. Isso cobre uma eventual defasagem entre o extrato
   e os dados publicados; quem decide se há algo a gravar é o hash.
3. As linhas vão para SICONFI_LINHA, versionadas (nada é sobrescrito).

Execuções com --forcar ignoram a janela e reverificam tudo (ainda pelo hash),
o que cobre períodos em que o ETL ficou fora do ar.
"""

import calendar
from collections import Counter
import hashlib
import json
import logging
from dataclasses import astuple, dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db import engine
from app.models import (
    EntregaDemonstrativo,
    Fonte,
    Municipio,
    PeriodoReferencia,
    SiconfiLinha,
    UnidadeGestora,
)
from etl.carga import (
    carregar_versionado,
    obter_ou_criar,
    registrar_falha,
    registrar_se_mudou,
    ultima_coleta,
)
from etl.http import get_json

log = logging.getLogger(__name__)

BASE_URL = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt"
DOC_URL = "https://apidatalake.tesouro.gov.br/docs/siconfi/"
JANELA_REVERIFICACAO = timedelta(days=7)

FOZ_DO_IGUACU = dict(codigo_ibge=4108304, codigo_ibge6=410830, nome="Foz do Iguaçu", uf="PR")
ID_ENTE = FOZ_DO_IGUACU["codigo_ibge"]

ENTREGAVEIS = {
    "Relatório Resumido de Execução Orçamentária": "RREO",
    "Relatório de Gestão Fiscal": "RGF",
    "Balanço Anual (DCA)": "DCA",
    "MSC Agregada": "MSC",
    "MSC Encerramento": "MSC",
}
COM_DADOS = {"RREO", "RGF", "DCA"}  # MSC: só o status de entrega, por ora
STATUS = {"HO": "homologado", "RE": "retificado", None: "entregue"}
TIPO_PERIODO = {"A": ("anual", 12), "Q": ("quadrimestral", 4), "B": ("bimestral", 2), "M": ("mensal", 1)}
CAMPOS_IDENTIDADE = ("instituicao", "anexo", "rotulo", "cod_conta", "conta", "coluna")


def datas_periodo(exercicio: int, periodicidade: str, periodo: int) -> tuple[date, date]:
    meses = TIPO_PERIODO[periodicidade][1]
    mes_fim = periodo * meses
    inicio = date(exercicio, mes_fim - meses + 1, 1)
    return inicio, date(exercicio, mes_fim, calendar.monthrange(exercicio, mes_fim)[1])


@dataclass(frozen=True, order=True)
class Relatorio:
    demonstrativo: str
    exercicio: int
    periodicidade: str
    periodo: int
    co_poder: str | None = None  # só RGF

    @property
    def endpoint(self) -> str:
        return f"{BASE_URL}/{self.demonstrativo.lower()}"

    @property
    def parametros(self) -> dict[str, Any]:
        p: dict[str, Any] = {"an_exercicio": self.exercicio, "id_ente": ID_ENTE}
        if self.demonstrativo == "RREO":
            p |= {"nr_periodo": self.periodo, "co_tipo_demonstrativo": "RREO"}
        elif self.demonstrativo == "RGF":
            p |= {
                "in_periodicidade": self.periodicidade,
                "nr_periodo": self.periodo,
                "co_tipo_demonstrativo": "RGF",
                "co_poder": self.co_poder,
            }
        return p

    def __str__(self) -> str:
        poder = f"/{self.co_poder}" if self.co_poder else ""
        return f"{self.demonstrativo} {self.exercicio} {self.periodicidade}{self.periodo}{poder}"


@dataclass(frozen=True)
class Entrega:
    demonstrativo: str
    instituicao: str
    poder: str  # executivo | legislativo
    periodicidade: str
    periodo: int
    status: str
    data_status: datetime | None

    def relatorio(self, exercicio: int) -> Relatorio:
        if self.demonstrativo == "DCA":
            return Relatorio("DCA", exercicio, "A", 1)
        co_poder = {"executivo": "E", "legislativo": "L"}[self.poder] if self.demonstrativo == "RGF" else None
        return Relatorio(self.demonstrativo, exercicio, self.periodicidade, self.periodo, co_poder)


@dataclass
class Referencias:
    fontes: dict[str, int]  # dataset -> fonte_id


def paginar(http: httpx.Client, url: str, params: dict[str, Any]) -> list[dict]:
    itens: list[dict] = []
    while True:
        pagina = get_json(http, url, {**params, "offset": len(itens)})
        itens.extend(pagina["items"])
        if not pagina.get("hasMore"):
            return itens
        if not pagina["items"]:
            raise RuntimeError(f"{url}: hasMore sem itens na página")


def preparar_referencias() -> Referencias:
    with engine.begin() as conn:
        conn.execute(pg_insert(Municipio).values(**FOZ_DO_IGUACU).on_conflict_do_nothing())
        fontes = {
            dataset: obter_ou_criar(
                conn, Fonte, ["sistema", "dataset"],
                orgao="STN", sistema="Siconfi", dataset=dataset, url_documentacao=DOC_URL,
            )
            for dataset in ("Extrato de entregas", "RREO", "RGF", "DCA")
        }
    return Referencias(fontes)


def poder_da_instituicao(instituicao: str) -> str | None:
    if instituicao.startswith("Prefeitura"):
        return "executivo"
    if instituicao.startswith("Câmara"):
        return "legislativo"
    return None


def ler_extrato(itens: list[dict]) -> list[Entrega]:
    entregas = []
    for i in itens:
        demonstrativo = ENTREGAVEIS.get(i["entregavel"])
        poder = poder_da_instituicao(i["instituicao"])
        if demonstrativo is None or poder is None or i["status_relatorio"] not in STATUS:
            log.warning("entrega ignorada (formato desconhecido): %s", i)
            continue
        if demonstrativo in COM_DADOS and i["tipo_relatorio"] != "P":
            # 'P' = padrão; versões simplificadas usam outro co_tipo_demonstrativo
            log.warning("tipo de relatório não suportado: %s", i)
            continue
        entregas.append(Entrega(
            demonstrativo=demonstrativo,
            instituicao=i["instituicao"],
            poder=poder,
            periodicidade=i["periodicidade"],
            periodo=i["periodo"],
            status=STATUS[i["status_relatorio"]],
            data_status=datetime.fromisoformat(i["data_status"]) if i["data_status"] else None,
        ))
    return entregas


def gravar_entregas(conn, refs: Referencias, exercicio: int, entregas: list[Entrega], coleta_id: int) -> None:
    linhas = {}
    for e in entregas:
        tipo, _ = TIPO_PERIODO[e.periodicidade]
        inicio, fim = datas_periodo(exercicio, e.periodicidade, e.periodo)
        periodo_id = obter_ou_criar(
            conn, PeriodoReferencia, ["tipo_periodo", "data_inicio", "data_fim", "data_referencia"],
            ano=exercicio, tipo_periodo=tipo, sequencia=None if tipo == "anual" else e.periodo,
            data_inicio=inicio, data_fim=fim, data_referencia=None,
        )
        unidade_id = obter_ou_criar(
            conn, UnidadeGestora, ["municipio_ibge", "nome"],
            municipio_ibge=ID_ENTE, nome=e.instituicao, poder=e.poder, tipo="adm_direta",
        )
        # o extrato só informa a data do status atual
        data = e.data_status.date() if e.data_status else None
        linhas[(periodo_id, e.demonstrativo, unidade_id)] = dict(
            municipio_ibge=ID_ENTE,
            unidade_gestora_id=unidade_id,
            periodo_id=periodo_id,
            fonte_id=refs.fontes["Extrato de entregas"],
            demonstrativo=e.demonstrativo,
            status=e.status,
            data_entrega=None if e.status == "homologado" else data,
            data_homologacao=data if e.status == "homologado" else None,
            coleta_id=coleta_id,
        )
    if not linhas:
        return
    stmt = pg_insert(EntregaDemonstrativo).values(list(linhas.values()))
    atual = EntregaDemonstrativo.__table__.c
    conn.execute(stmt.on_conflict_do_update(
        index_elements=["municipio_ibge", "periodo_id", "fonte_id", "demonstrativo", "unidade_gestora_id"],
        set_=dict(
            status=stmt.excluded.status,
            # preserva datas já conhecidas quando o novo status não as informa
            data_entrega=func.coalesce(stmt.excluded.data_entrega, atual.data_entrega),
            data_homologacao=func.coalesce(stmt.excluded.data_homologacao, atual.data_homologacao),
            coleta_id=stmt.excluded.coleta_id,
        ),
    ))


def linhas_do_relatorio(rel: Relatorio, itens: list[dict]) -> list[dict]:
    linhas = {}
    ocorrencias: Counter = Counter()
    for ordem, i in enumerate(itens):
        if i["exercicio"] != rel.exercicio or i.get("periodo", rel.periodo) != rel.periodo:
            raise ValueError(f"{rel}: linha de outro período na resposta: {i}")
        if i.get("co_poder", rel.co_poder) != rel.co_poder:
            raise ValueError(f"{rel}: linha de outro poder na resposta: {i}")
        faltando = [c for c in CAMPOS_IDENTIDADE if c != "rotulo" and i.get(c) is None]
        if faltando:
            raise ValueError(f"{rel}: linha sem {faltando}: {i}")
        campos = tuple(i[c] for c in CAMPOS_IDENTIDADE)
        ocorrencias[campos] += 1
        ocorrencia = ocorrencias[campos]
        # a ocorrência só entra na identidade quando há repetição, para que a
        # chave das linhas comuns não dependa dela
        identidade = [ID_ENTE, *astuple(rel), *campos] + ([ocorrencia] if ocorrencia > 1 else [])
        chave = hashlib.sha256(json.dumps(identidade, ensure_ascii=False).encode()).hexdigest()
        linhas[chave] = dict(
            chave=chave,
            municipio_ibge=ID_ENTE,
            demonstrativo=rel.demonstrativo,
            exercicio=rel.exercicio,
            periodicidade=rel.periodicidade,
            periodo=rel.periodo,
            co_poder=rel.co_poder,
            **dict(zip(CAMPOS_IDENTIDADE, campos)),
            ocorrencia=ocorrencia,
            ordem=ordem,
            valor=i["valor"],
        )
    return list(linhas.values())


def coletar_relatorio(
    http: httpx.Client, refs: Referencias, rel: Relatorio, data_status: datetime | None, forcar: bool
) -> None:
    fonte_id = refs.fontes[rel.demonstrativo]
    with engine.connect() as conn:
        anterior = ultima_coleta(conn, fonte_id, rel.endpoint, rel.parametros)
    mudou_recentemente = data_status is not None and data_status > datetime.now(UTC) - JANELA_REVERIFICACAO
    if anterior is not None and not mudou_recentemente and not forcar:
        return

    itens = paginar(http, rel.endpoint, rel.parametros)
    if not itens:
        # entregue mas ainda não publicado na API: tenta de novo na próxima execução
        log.warning("%s: consta no extrato, mas a API não devolveu linhas", rel)
        return
    linhas = linhas_do_relatorio(rel, itens)

    with engine.begin() as conn:
        coleta_id = registrar_se_mudou(
            conn, fonte_id, rel.endpoint, rel.parametros, itens,
            datas_periodo(rel.exercicio, rel.periodicidade, rel.periodo),
        )
        if coleta_id is None:
            log.info("%s: sem mudanças (mesmo hash)", rel)
            return
        escopo = dict(
            municipio_ibge=ID_ENTE, demonstrativo=rel.demonstrativo, exercicio=rel.exercicio,
            periodicidade=rel.periodicidade, periodo=rel.periodo, co_poder=rel.co_poder,
        )
        resumo = carregar_versionado(
            conn, SiconfiLinha.__table__, linhas, coleta_id, ["chave"], escopo, no_lugar=("ordem",)
        )
    log.info("%s: %d linhas; %s", rel, len(linhas), resumo)


def coletar_exercicio(http: httpx.Client, refs: Referencias, exercicio: int, forcar: bool) -> int:
    """Devolve o número de relatórios que falharam."""
    url = f"{BASE_URL}/extrato_entregas"
    params = {"id_ente": ID_ENTE, "an_referencia": exercicio}
    try:
        itens = paginar(http, url, params)
    except Exception:
        with engine.begin() as conn:
            registrar_falha(conn, refs.fontes["Extrato de entregas"], url, params)
        raise
    if not itens:
        log.info("%d: nenhuma entrega no extrato", exercicio)
        return 0
    entregas = ler_extrato(itens)

    with engine.begin() as conn:
        coleta_id = registrar_se_mudou(
            conn, refs.fontes["Extrato de entregas"], url, params, itens,
            (date(exercicio, 1, 1), date(exercicio, 12, 31)),
        )
        if coleta_id is not None:
            gravar_entregas(conn, refs, exercicio, entregas, coleta_id)
            log.info("%d: extrato atualizado (%d entregas)", exercicio, len(entregas))

    # Prefeitura e Câmara podem constar para o mesmo relatório (ex.: DCA consolidada)
    relatorios: dict[Relatorio, datetime | None] = {}
    for e in entregas:
        if e.demonstrativo in COM_DADOS:
            rel = e.relatorio(exercicio)
            datas = [d for d in (relatorios.get(rel), e.data_status) if d is not None]
            relatorios[rel] = max(datas, default=None)

    falhas = 0
    for rel, data_status in sorted(relatorios.items()):
        try:
            coletar_relatorio(http, refs, rel, data_status, forcar)
        except Exception:
            log.exception("%s: falha na coleta", rel)
            falhas += 1
            with engine.begin() as conn:
                registrar_falha(conn, refs.fontes[rel.demonstrativo], rel.endpoint, rel.parametros)
    return falhas


def executar(http: httpx.Client, desde: int, ate: int, forcar: bool) -> int:
    """Coleta os exercícios de `desde` a `ate`. Devolve o número de falhas."""
    refs = preparar_referencias()
    falhas = 0
    for exercicio in range(desde, ate + 1):
        try:
            falhas += coletar_exercicio(http, refs, exercicio, forcar)
        except Exception:
            log.exception("%d: falha ao processar o extrato de entregas", exercicio)
            falhas += 1
    return falhas
