"""DESPESA por função/subfunção a partir das linhas brutas do Siconfi.

Fontes:
- DCA Anexo I-E (anual): contas com código ("04 - Administração",
  "04.122 - Administração Geral", "FU04 - Demais Subfunções").
- RREO Anexo 02 (bimestral): contas só com nome. A função de uma subfunção é a
  da última linha de função acima dela (por isso SICONFI_LINHA guarda `ordem`);
  a partir de 2018 a fonte prefixa subfunções repetidas com "FUnn - ".

Regras:
- totais e cabeçalhos de seção não viram linhas; só marcam se as linhas
  seguintes são intraorçamentárias;
- nível 'subfuncao' com subfuncao_id nulo = "Demais Subfunções" (agregado
  publicado pela fonte);
- colunas derivadas (%, saldo) não são gravadas; coluna desconhecida
  interrompe a transformação, para que nada seja descartado em silêncio;
- valor nulo na fonte não vira zero: a linha é omitida.
"""

import logging
import re
from dataclasses import dataclass
from datetime import date

from sqlalchemy import Connection, select

from app.models import Despesa, PeriodoReferencia, SiconfiLinha, UnidadeGestora
from etl.carga import ResumoCarga, carregar_versionado, obter_ou_criar
from etl.classificacao import Classificacoes, normalizar
from etl.siconfi import ID_ENTE, TIPO_PERIODO, datas_periodo

log = logging.getLogger(__name__)

UNIDADE_CONSOLIDADA = "Município de Foz do Iguaçu (consolidado)"

ESTAGIOS_DCA = {
    "despesasempenhadas": "empenhada",
    "despesasliquidadas": "liquidada",
    "despesaspagas": "paga",
    "inscricaoderestosapagarnaoprocessados": "rp_np_inscrito",
    "inscricaoderestosapagarprocessados": "rp_p_inscrito",
}

# (padrão no nome normalizado da coluna, estágio, acumulado no exercício)
ESTAGIOS_RREO = [
    (r"^dotacaoinicial", "dotacao_inicial", True),
    (r"^dotacaoatualizada", "dotacao_atualizada", True),
    (r"^despesasempenhadasnobimestre", "empenhada", False),
    (r"^despesasempenhadasateobimestre", "empenhada", True),
    (r"^despesasliquidadasnobimestre", "liquidada", False),
    (r"^despesasliquidadasateobimestre", "liquidada", True),
    (r"^despesaspagasateobimestre", "paga", True),
    (r"^inscritasemrestosapagarnaoprocessados", "rp_np_inscrito", True),
]
COLUNAS_DERIVADAS_RREO = re.compile(r"^(saldo|\w*total\w*$)")


@dataclass
class Contexto:
    conn: Connection
    funcoes: Classificacoes
    subfuncoes: Classificacoes
    unidade_id: int
    fontes: dict[str, int]
    periodos: dict[tuple, int]

    def periodo(self, exercicio: int, periodicidade: str, periodo: int, acumulado: bool) -> int:
        chave = (exercicio, periodicidade, periodo, acumulado)
        if chave not in self.periodos:
            tipo, _ = TIPO_PERIODO[periodicidade]
            inicio_periodo, fim = datas_periodo(exercicio, periodicidade, periodo)
            inicio = date(exercicio, 1, 1) if acumulado else inicio_periodo
            self.periodos[chave] = obter_ou_criar(
                self.conn, PeriodoReferencia, ["tipo_periodo", "data_inicio", "data_fim", "data_referencia"],
                ano=exercicio, tipo_periodo=tipo, sequencia=None if tipo == "anual" else periodo,
                data_inicio=inicio, data_fim=fim, data_referencia=None,
                # no 1º período do ano, acumulado e isolado são o mesmo intervalo
                acumulado_no_exercicio=inicio != inicio_periodo,
            )
        return self.periodos[chave]

    def linha(self, origem, demonstrativo: str, funcao: str, subfuncao: str | None, nivel: str,
              intra: bool, estagio: str, periodo_id: int) -> dict:
        ano = origem.exercicio
        return dict(
            municipio_ibge=ID_ENTE,
            unidade_gestora_id=self.unidade_id,
            periodo_id=periodo_id,
            fonte_id=self.fontes[origem.demonstrativo],
            demonstrativo=demonstrativo,
            nivel_detalhe=nivel,
            funcao_id=self.funcoes.por_codigo(funcao, ano),
            subfuncao_id=self.subfuncoes.por_codigo(subfuncao, ano) if subfuncao else None,
            natureza_despesa_id=None,
            fonte_recurso_id=None,
            programa_codigo=None,
            acao_codigo=None,
            intraorcamentaria=intra,
            estagio=estagio,
            valor=origem.valor,
            coleta_id=origem.coleta_id,
        )


def linhas_vigentes(conn: Connection, demonstrativo: str, anexo_sufixo: str):
    """Linhas vigentes de um anexo, por relatório e coluna, na ordem publicada."""
    t = SiconfiLinha.__table__.c
    return conn.execute(
        select(t.exercicio, t.periodicidade, t.periodo, t.demonstrativo, t.anexo, t.conta,
               t.coluna, t.valor, t.coleta_id)
        .where(t.municipio_ibge == ID_ENTE, t.demonstrativo == demonstrativo,
               t.anexo.like(f"%{anexo_sufixo}"), t.valido_ate.is_(None))
        .order_by(t.exercicio, t.periodo, t.coluna, t.ordem)
    ).all()


def secao_intra(conta: str) -> bool | None:
    """True/False se a linha abre a seção intra/exceto-intra; None se não é cabeçalho."""
    n = normalizar(conta)
    if n.startswith("despesasexcetointra"):
        return False
    if n.startswith("despesasintra"):
        return True
    return None


DCA_FUNCAO = re.compile(r"^(\d{2}) - ")
DCA_SUBFUNCAO = re.compile(r"^(\d{2})\.(\d{3}) - ")
PREFIXO_FUNCAO = re.compile(r"^FU(\d{2}) - (.+)$")


def despesa_dca(ctx: Contexto) -> list[dict]:
    linhas, intra, chave_coluna = [], False, None
    for r in linhas_vigentes(ctx.conn, "DCA", "Anexo I-E"):
        if (r.exercicio, r.coluna) != chave_coluna:
            chave_coluna, intra = (r.exercicio, r.coluna), False
        estagio = ESTAGIOS_DCA.get(normalizar(r.coluna))
        if estagio is None:
            raise ValueError(f"DCA {r.exercicio} I-E: coluna desconhecida {r.coluna!r}")
        if (secao := secao_intra(r.conta)) is not None:
            intra = secao
            continue
        if r.valor is None:
            continue
        periodo_id = ctx.periodo(r.exercicio, "A", 1, False)
        if m := DCA_SUBFUNCAO.match(r.conta):
            linhas.append(ctx.linha(r, "DCA-I-E", m[1], m[2], "subfuncao", intra, estagio, periodo_id))
        elif m := DCA_FUNCAO.match(r.conta):
            linhas.append(ctx.linha(r, "DCA-I-E", m[1], None, "funcao", intra, estagio, periodo_id))
        elif (m := PREFIXO_FUNCAO.match(r.conta)) and normalizar(m[2]) == "demaissubfuncoes":
            linhas.append(ctx.linha(r, "DCA-I-E", m[1], None, "subfuncao", intra, estagio, periodo_id))
        else:
            raise ValueError(f"DCA {r.exercicio} I-E: conta não reconhecida {r.conta!r}")
    return linhas


def estagio_rreo(coluna: str) -> tuple[str, bool] | None:
    n = normalizar(coluna)
    for padrao, estagio, acumulado in ESTAGIOS_RREO:
        if re.match(padrao, n):
            return estagio, acumulado
    if COLUNAS_DERIVADAS_RREO.match(n) or "%" in coluna:
        return None
    raise ValueError(f"RREO Anexo 02: coluna desconhecida {coluna!r}")


def despesa_rreo(ctx: Contexto) -> list[dict]:
    linhas = []
    funcao, intra, chave_coluna = None, False, None
    for r in linhas_vigentes(ctx.conn, "RREO", "Anexo 02"):
        if (r.exercicio, r.periodo, r.coluna) != chave_coluna:
            chave_coluna, funcao, intra = (r.exercicio, r.periodo, r.coluna), None, False
        if (secao := secao_intra(r.conta)) is not None:
            funcao, intra = None, secao
            continue
        if normalizar(r.conta).startswith("total"):
            funcao = None  # total geral (I + II): fecha as seções
            continue
        if (mapeado := estagio_rreo(r.coluna)) is None:
            continue
        estagio, acumulado = mapeado
        if not acumulado and r.periodo == 1:
            continue  # no 1º bimestre, "no bimestre" = "até o bimestre"

        nome, funcao_explicita = r.conta, None
        if m := PREFIXO_FUNCAO.match(nome):
            funcao_explicita, nome = m[1], m[2]
        try:
            codigo_funcao = ctx.funcoes.codigo_por_nome(nome, r.exercicio)
        except LookupError:
            codigo_funcao = None

        if codigo_funcao and not funcao_explicita:
            funcao, nivel, subfuncao = codigo_funcao, "funcao", None
        elif normalizar(nome) == "demaissubfuncoes":
            nivel, subfuncao = "subfuncao", None
        else:
            try:
                nivel, subfuncao = "subfuncao", ctx.subfuncoes.codigo_por_nome(nome, r.exercicio)
            except LookupError:
                raise ValueError(f"RREO {r.exercicio} B{r.periodo}: conta não reconhecida {r.conta!r}")
        funcao_da_linha = funcao_explicita or funcao
        if funcao_da_linha is None:
            raise ValueError(f"RREO {r.exercicio} B{r.periodo}: subfunção sem função {r.conta!r}")
        if r.valor is None:
            continue
        periodo_id = ctx.periodo(r.exercicio, "B", r.periodo, acumulado)
        linhas.append(ctx.linha(r, "RREO-A2", funcao_da_linha, subfuncao, nivel, intra, estagio, periodo_id))
    return linhas


CHAVES_DESPESA = [
    "municipio_ibge", "unidade_gestora_id", "periodo_id", "fonte_id", "demonstrativo",
    "nivel_detalhe", "funcao_id", "subfuncao_id", "natureza_despesa_id", "fonte_recurso_id",
    "programa_codigo", "acao_codigo", "intraorcamentaria", "estagio",
]


def transformar(conn: Connection, fontes: dict[str, int]) -> dict[str, ResumoCarga]:
    unidade_id = obter_ou_criar(
        conn, UnidadeGestora, ["municipio_ibge", "nome"],
        municipio_ibge=ID_ENTE, nome=UNIDADE_CONSOLIDADA, poder=None, tipo="consolidado",
    )
    ctx = Contexto(
        conn, Classificacoes(conn, "funcao"), Classificacoes(conn, "subfuncao"), unidade_id, fontes, {},
    )
    resumos = {}
    for demonstrativo, gerar in (("DCA-I-E", despesa_dca), ("RREO-A2", despesa_rreo)):
        linhas = gerar(ctx)
        duplicadas = len(linhas) - len({tuple(l[k] for k in CHAVES_DESPESA) for l in linhas})
        if duplicadas:
            raise ValueError(f"{demonstrativo}: {duplicadas} linhas com a mesma chave")
        resumos[demonstrativo] = carregar_versionado(
            conn, Despesa.__table__, linhas, None, CHAVES_DESPESA,
            {"municipio_ibge": ID_ENTE, "demonstrativo": demonstrativo},
        )
        log.info("DESPESA %s: %d linhas; %s", demonstrativo, len(linhas), resumos[demonstrativo])
    return resumos
