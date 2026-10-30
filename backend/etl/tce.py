"""Coletor do TCE-PR: "Download de Dados" do Portal Informação para Todos.

Um zip por município, ano e tema (pit.tce.pr.gov.br/Arquivos/<ano>/...), com
XMLs do SIM-AM regenerados pelo Tribunal quando chegam novas remessas.

Fluxo por (tema, ano), só dentro da janela de gestões:
1. HEAD: se o arquivo não mudou (Last-Modified) desde a última coleta, para.
2. Baixa e lê os XMLs em fluxo; o hash ignora campos de controle que mudam a
   cada geração do arquivo (data de referência, último envio).
3. Se o hash é o da última coleta, não grava nada; senão carrega cada tabela
   com versionamento, no escopo (município, ano).

Entidades novas (idPessoa desconhecido) interrompem a carga: precisam ser
classificadas em ENTIDADES (poder e tipo) antes.
"""

import hashlib
import io
import json
import logging
import zipfile
from collections.abc import Callable, Iterator
from datetime import date
from decimal import Decimal
from email.utils import parsedate_to_datetime
from xml.etree.ElementTree import iterparse

import httpx
from sqlalchemy import Connection, select, tuple_
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db import engine
from app.models import (
    Contrato,
    ContratoAditivo,
    Credor,
    Empenho,
    EmpenhoMovimento,
    Fonte,
    Licitacao,
    UnidadeGestora,
    Vinculo,
)
from etl.carga import carregar_versionado, obter_ou_criar, registrar_falha, registrar_se_mudou, ultima_coleta
from etl.classificacao import Classificacoes
from etl.http import requisitar
from etl.siconfi import FOZ_DO_IGUACU, ID_ENTE

log = logging.getLogger(__name__)

URL = "https://pit.tce.pr.gov.br/Arquivos/{ano}/{ano}_{ibge6}_{tema}.zip"
DOC_URL = "https://pit.tce.pr.gov.br/Dados/DadosConsulta/Consolidado"
CONTROLE = {"DataReferencia", "ultimoEnvioSIMAMNesteExercicio", "DataEnvioParaTCE"}

# idPessoa (SIM-AM) -> (nome, poder, tipo). Prefeitura e Câmara usam o mesmo
# nome do Siconfi, para serem a mesma UNIDADE_GESTORA nas duas fontes.
ENTIDADES = {
    12294: ("Prefeitura Municipal de Foz do Iguaçu - PR", "executivo", "adm_direta"),
    9808: ("Câmara de Vereadores de Foz do Iguaçu - PR", "legislativo", "adm_direta"),
    15025: ("FOZTRANS - Instituto de Transportes e Trânsito de Foz do Iguaçu", "executivo", "autarquia"),
    10891: ("Fundação Cultural de Foz do Iguaçu", "executivo", "fundacao"),
    933995: ("Fundação Municipal de Saúde de Foz do Iguaçu", "executivo", "fundacao"),
    103577: ("FOZHABITA - Instituto de Habitação de Foz do Iguaçu", "executivo", "autarquia"),
    205311: ("FOZPREV - Foz Previdência", "executivo", "rpps"),
    473745: ("Foz Previdência - Fundo Previdenciário", "executivo", "rpps"),
    473746: ("Foz Previdência - Fundo Financeiro", "executivo", "rpps"),
}


# --- leitura -----------------------------------------------------------------

def texto(v: str | None) -> str | None:
    v = (v or "").strip()
    return v or None


def obrigatorio(r: dict, campo: str) -> str:
    if (v := texto(r.get(campo))) is None:
        raise ValueError(f"campo obrigatório vazio: {campo} em {r}")
    return v


def decimal(v: str | None) -> Decimal | None:
    return Decimal(v) if texto(v) else None


def data(v: str | None) -> date | None:
    return date.fromisoformat(v.strip()[:10]) if texto(v) else None


class Arquivo:
    """Zip do PIT; os XMLs são lidos em fluxo (o de empenhos passa de 80 MB)."""

    def __init__(self, conteudo: bytes):
        self.zip = zipfile.ZipFile(io.BytesIO(conteudo))

    def _ler(self, nome: str) -> Iterator[dict]:
        with self.zip.open(nome) as f:
            for _, el in iterparse(f):
                if el.attrib:
                    yield {k: v for k, v in el.attrib.items() if k not in CONTROLE}
                el.clear()

    def registros(self, sufixo: str) -> Iterator[dict]:
        nomes = [n for n in self.zip.namelist() if n.endswith(f"_{sufixo}.xml")]
        if len(nomes) != 1:
            raise ValueError(f"esperado um arquivo *_{sufixo}.xml, achados: {nomes}")
        return self._ler(nomes[0])

    def hash(self) -> str:
        """sha256 de todos os XMLs, sem os campos de controle que mudam a cada
        geração do arquivo."""
        h = hashlib.sha256()
        for nome in sorted(self.zip.namelist()):
            h.update(nome.encode())
            for r in self._ler(nome):
                h.update(json.dumps(r, sort_keys=True, ensure_ascii=False).encode())
        return h.hexdigest()


# --- referências ---------------------------------------------------------------

def unidades(conn: Connection) -> Callable[[str], int]:
    cache: dict[int, int] = {}

    def unidade(id_pessoa: str) -> int:
        codigo = int(id_pessoa)
        if codigo not in cache:
            if codigo not in ENTIDADES:
                raise ValueError(f"entidade do SIM-AM não classificada: idPessoa={codigo}")
            nome, poder, tipo = ENTIDADES[codigo]
            stmt = pg_insert(UnidadeGestora).values(
                municipio_ibge=ID_ENTE, nome=nome, poder=poder, tipo=tipo, codigo_tce=codigo
            )
            cache[codigo] = conn.execute(
                stmt.on_conflict_do_update(
                    index_elements=["municipio_ibge", "nome"], set_={"codigo_tce": stmt.excluded.codigo_tce}
                ).returning(UnidadeGestora.id)
            ).scalar_one()
        return cache[codigo]

    return unidade


def documento(tipo: str | None, numero: str | None) -> tuple[str, str]:
    numero = texto(numero) or ""
    digitos = "".join(c for c in numero if c.isdigit())
    if tipo is None:
        tipo = {14: "CNPJ", 11: "CPF"}.get(len(digitos), "CPF" if "*" in numero else "outro")
    if tipo == "CPF" and "*" not in numero:
        if len(digitos) != 11:
            return "outro", numero
        numero = f"***.{digitos[3:6]}.***-**"  # nunca guardar CPF completo
    elif tipo == "CNPJ":
        numero = digitos
    return tipo, numero


def credores(conn: Connection, chaves: set[tuple[str, str, str]]) -> dict[tuple[str, str, str], int]:
    if not chaves:
        return {}
    lista = [dict(tipo_documento=t, documento=d, nome=n) for t, d, n in chaves]
    for i in range(0, len(lista), 1000):
        conn.execute(pg_insert(Credor).values(lista[i : i + 1000]).on_conflict_do_nothing())
    c = Credor.__table__.c
    ids = {}
    chaves_lista = list(chaves)
    for i in range(0, len(chaves_lista), 1000):
        for r in conn.execute(
            select(c.id, c.tipo_documento, c.documento, c.nome).where(
                tuple_(c.tipo_documento, c.documento, c.nome).in_(chaves_lista[i : i + 1000])
            )
        ):
            ids[(r.tipo_documento, r.documento, r.nome)] = r.id
    return ids


# --- temas -----------------------------------------------------------------------

def carregar_despesa(conn: Connection, arq: Arquivo, ano: int, coleta_id: int) -> dict:
    unidade = unidades(conn)
    funcoes, subfuncoes = Classificacoes(conn, "funcao"), Classificacoes(conn, "subfuncao")
    empenhos, chaves_credor = [], set()
    for r in arq.registros("Empenho"):
        if int(r["nrAnoEmpenho"]) != ano:
            raise ValueError(f"empenho de outro ano no arquivo de {ano}: {r['idEmpenho']}")
        credor = None
        if texto(r.get("nmCredor")) or texto(r.get("nrDocCredor")):
            credor = (*documento(texto(r.get("sgDocCredor")), r.get("nrDocCredor")), obrigatorio(r, "nmCredor"))
            chaves_credor.add(credor)
        else:
            log.warning("empenho %s sem credor informado pela entidade", r["idEmpenho"])
        modalidade = obrigatorio(r, "cdModalidade")
        empenhos.append(dict(
            id_tce=int(r["idEmpenho"]),
            municipio_ibge=ID_ENTE,
            unidade_gestora_id=unidade(r["idPessoa"]),
            ano=ano,
            numero=int(r["nrEmpenho"]),
            data=data(r["dtEmpenho"]),
            tipo=obrigatorio(r, "dsTipoEmpenho"),
            credor_id=credor,  # trocado pelo id abaixo
            funcao_id=funcoes.por_codigo(obrigatorio(r, "cdFuncao").zfill(2), ano),
            subfuncao_id=subfuncoes.por_codigo(obrigatorio(r, "cdSubFuncao").zfill(3), ano),
            natureza_codigo=".".join(obrigatorio(r, k) for k in (
                "cdCategoriaEconomica", "cdGrupoNatureza", "cdModalidade", "cdElemento",
                "cdDesdobramento", "cdDetalhamento")),
            natureza_descricao=obrigatorio(r, "dsDesdobramento"),
            intraorcamentaria=modalidade == "91",
            fonte_recurso_codigo=obrigatorio(r, "cdFontePadrao"),
            fonte_recurso_descricao=obrigatorio(r, "dsFontePadrao"),
            orgao_codigo=obrigatorio(r, "cdOrgao"),
            orgao_nome=obrigatorio(r, "nmOrgao"),
            unidade_orcamentaria_codigo=obrigatorio(r, "cdUnidade"),
            unidade_orcamentaria_nome=obrigatorio(r, "nmUnidade"),
            programa_codigo=obrigatorio(r, "cdPrograma"),
            acao_codigo=obrigatorio(r, "cdProjetoAtividade"),
            acao_descricao=obrigatorio(r, "dsProjetoAtividade"),
            historico=texto(r.get("dsHistorico")),
            valor=decimal(r["vlEmpenho"]),
        ))
    ids_credor = credores(conn, chaves_credor)
    for e in empenhos:
        e["credor_id"] = ids_credor.get(e["credor_id"])

    movimentos = []

    def movimento(tipo: str, sufixo: str, id_campo: str, data_campo: str, valor_campo: str):
        for r in arq.registros(sufixo):
            movimentos.append(dict(
                municipio_ibge=ID_ENTE, ano=ano, tipo=tipo, id_tce=int(r[id_campo]),
                empenho_id_tce=int(r["idEmpenho"]), data=data(r[data_campo]), valor=decimal(r[valor_campo]),
            ))

    movimento("liquidacao", "EmpenhoLiquidacao", "idLiquidacao", "dtLiquidacao", "vlLiquidacaoBruto")
    movimento("estorno_liquidacao", "EmpenhoLiquidacaoEstorno", "idEstornoLiquidacao", "dtEstorno", "vlEstorno")
    # Em EmpenhoPagamento os nomes dos últimos atributos vêm deslocados em
    # relação aos valores (vlPagamentoBruto traz "BANCO"); data e valor da
    # operação estão corretos e são os únicos usados.
    movimento("pagamento", "EmpenhoPagamento", "idPagamento", "dtOperacao", "vlOperacao")
    movimento("estorno_pagamento", "EmpenhoPagamentoEstorno", "idEstornoPagamento", "dtEstorno", "vlEstorno")

    escopo = {"municipio_ibge": ID_ENTE, "ano": ano}
    return {
        "empenho": carregar_versionado(conn, Empenho.__table__, empenhos, coleta_id, ["id_tce"], escopo),
        "empenho_movimento": carregar_versionado(
            conn, EmpenhoMovimento.__table__, movimentos, coleta_id, ["tipo", "id_tce"], escopo
        ),
    }


def carregar_contrato(conn: Connection, arq: Arquivo, ano: int, coleta_id: int) -> dict:
    unidade = unidades(conn)
    contratos, chaves_credor = [], set()
    for r in arq.registros("Contrato"):
        credor = (*documento(None, r.get("nrDocContratado")), obrigatorio(r, "nmContratado"))
        chaves_credor.add(credor)
        contratos.append(dict(
            id_tce=int(r["idContrato"]), municipio_ibge=ID_ENTE, unidade_gestora_id=unidade(r["idPessoa"]),
            ano=ano, numero=obrigatorio(r, "nrContrato"), ano_contrato=int(r["nrAnoContrato"]),
            credor_id=credor, objeto=obrigatorio(r, "dsObjeto"), valor=decimal(r["vlContrato"]),
            data_assinatura=data(r.get("dtAssinatura")), data_inicio=data(r.get("dtInicio")),
            data_fim=data(r.get("dtFim")),
        ))
    ids_credor = credores(conn, chaves_credor)
    for c in contratos:
        c["credor_id"] = ids_credor[c["credor_id"]]

    prazos = {
        (int(r["idcontrato"]), int(r["nrAnoAditivoContrato"]), int(r["nrAditivoContrato"])): data(r.get("dtFim"))
        for r in arq.registros("ContratoAditivoPrazo")
    }
    aditivos = []
    for r in arq.registros("ContratoAditivo"):
        chave = (int(r["idcontrato"]), int(r["nrAnoAditivoContrato"]), int(r["nrAditivoContrato"]))
        aditivos.append(dict(
            municipio_ibge=ID_ENTE, ano=ano, contrato_id_tce=chave[0], ano_aditivo=chave[1], numero=chave[2],
            tipo=obrigatorio(r, "dsTipoAditivoContrato"), operacao=texto(r.get("dsTipoOperacaoAditivoContrato")),
            valor=decimal(r.get("vlAditivo")), valor_contrato_atualizado=decimal(r.get("vlAtualizadoContrato")),
            nova_data_fim=prazos.get(chave), data=data(r.get("dtAditivoContrato")),
        ))
    escopo = {"municipio_ibge": ID_ENTE, "ano": ano}
    return {
        "contrato": carregar_versionado(conn, Contrato.__table__, contratos, coleta_id, ["id_tce"], escopo),
        "contrato_aditivo": carregar_versionado(
            conn, ContratoAditivo.__table__, aditivos, coleta_id,
            ["contrato_id_tce", "ano_aditivo", "numero", "operacao"], escopo,
        ),
    }


def carregar_licitacao(conn: Connection, arq: Arquivo, ano: int, coleta_id: int) -> dict:
    unidade = unidades(conn)
    licitacoes = [
        dict(
            id_tce=int(r["idLicitacao"]), municipio_ibge=ID_ENTE, unidade_gestora_id=unidade(r["idPessoa"]),
            ano=ano, modalidade=obrigatorio(r, "dsModalidadeLicitacao"), numero=obrigatorio(r, "nrLicitacao"),
            ano_licitacao=int(r["nrAnoLicitacao"]), objeto=obrigatorio(r, "dsObjeto"),
            valor=decimal(r.get("vlLicitacao")), situacao=texto(r.get("dsTipoSituacaoLicitacao")),
            natureza=texto(r.get("dsNaturezaLicitacao")), data_abertura=data(r.get("dtAbertura")),
        )
        for r in arq.registros("Licitacao")
    ]
    escopo = {"municipio_ibge": ID_ENTE, "ano": ano}
    return {"licitacao": carregar_versionado(conn, Licitacao.__table__, licitacoes, coleta_id, ["id_tce"], escopo)}


def carregar_relacionamentos(conn: Connection, arq: Arquivo, ano: int, coleta_id: int) -> dict:
    vinculos = {}
    for tipo, sufixo, origem, destino in (
        ("empenho_contrato", "EmpenhoXContrato", "idEmpenho", "idContrato"),
        ("empenho_licitacao", "LicitacaoXEmpenho", "idEmpenho", "idLicitacao"),
        ("licitacao_contrato", "LicitacaoXContrato", "idLicitacao", "idContrato"),
    ):
        incompletos = 0
        for r in arq.registros(sufixo):
            if not (texto(r.get(origem)) and texto(r.get(destino))):
                incompletos += 1  # ex.: empenho sem licitação; não liga nada
                continue
            v = dict(municipio_ibge=ID_ENTE, ano=ano, tipo=tipo,
                     origem_id_tce=int(r[origem]), destino_id_tce=int(r[destino]))
            vinculos[(tipo, v["origem_id_tce"], v["destino_id_tce"])] = v  # a fonte repete pares
        if incompletos:
            log.info("TCE vínculos %s %d: %d registros sem um dos lados, ignorados", tipo, ano, incompletos)
    escopo = {"municipio_ibge": ID_ENTE, "ano": ano}
    return {"vinculo": carregar_versionado(
        conn, Vinculo.__table__, list(vinculos.values()), coleta_id,
        ["ano", "tipo", "origem_id_tce", "destino_id_tce"], escopo,
    )}


TEMAS = {
    "Despesa": carregar_despesa,
    "Contrato": carregar_contrato,
    "Licitacao": carregar_licitacao,
    "Relacionamentos": carregar_relacionamentos,
}


# --- coleta ------------------------------------------------------------------------

def coletar(http: httpx.Client, tema: str, ano: int, forcar: bool, recarregar: bool = False) -> None:
    """`forcar`: baixa mesmo sem mudança no Last-Modified (ainda decide pelo
    hash). `recarregar`: carrega mesmo com o mesmo hash, para aplicar uma
    regra de carga nova a um arquivo que não mudou."""
    url = URL.format(ano=ano, ibge6=FOZ_DO_IGUACU["codigo_ibge6"], tema=tema)
    with engine.begin() as conn:
        fonte_id = obter_ou_criar(
            conn, Fonte, ["sistema", "dataset"],
            orgao="TCE-PR", sistema="SIM-AM", dataset=f"PIT {tema}", url_documentacao=DOC_URL,
        )
        anterior = ultima_coleta(conn, fonte_id, url, {})
    try:
        cabecalho = requisitar(http, "HEAD", url)
        modificado = parsedate_to_datetime(cabecalho.headers["last-modified"])
        if anterior is not None and not (forcar or recarregar) and anterior.executada_em >= modificado:
            return
        arq = Arquivo(requisitar(http, "GET", url).content)
        with engine.begin() as conn:
            coleta_id = registrar_se_mudou(
                conn, fonte_id, url, {}, arq.hash(), (date(ano, 1, 1), date(ano, 12, 31)), url,
                sempre=recarregar,
            )
            if coleta_id is None:
                log.info("TCE %s %d: sem mudanças (mesmo hash)", tema, ano)
                return
            resumos = TEMAS[tema](conn, arq, ano, coleta_id)
        for tabela, resumo in resumos.items():
            log.info("TCE %s %d: %s: %s", tema, ano, tabela, resumo)
    except Exception:
        with engine.begin() as conn:
            registrar_falha(conn, fonte_id, url, {})
        raise


def executar(
    http: httpx.Client, desde: int, ate: int, temas: list[str], forcar: bool, recarregar: bool = False
) -> int:
    falhas = 0
    for ano in range(desde, ate + 1):
        for tema in temas:
            try:
                coletar(http, tema, ano, forcar, recarregar)
            except Exception:
                log.exception("TCE %s %d: falha na coleta", tema, ano)
                falhas += 1
    return falhas
