"""Camada verde do MER: códigos oficiais, cadastros e tempo."""

from datetime import date
from decimal import Decimal

from sqlalchemy import (
    CHAR,
    CheckConstraint,
    ForeignKey,
    Numeric,
    UniqueConstraint,
    false,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    Base,
    BigInt,
    BigIntPK,
    DadoBruto,
    IntPK,
    Jsonb,
    Texto,
    check_in,
    unico_versao_atual,
)


class ClassificacaoOficial(Base):
    __tablename__ = "classificacao_oficial"
    __table_args__ = (
        UniqueConstraint("tipo", "codigo", "versao"),
        # alvo das FKs compostas (id, tipo) de DESPESA e RECEITA
        UniqueConstraint("id", "tipo"),
        check_in("tipo", "funcao", "subfuncao", "natureza_despesa", "natureza_receita", "fonte_recurso"),
    )

    id: Mapped[IntPK]
    tipo: Mapped[str]
    codigo: Mapped[str]
    descricao: Mapped[str]
    nivel: Mapped[str]  # categoria | grupo | modalidade | elemento ...
    pai_id: Mapped[int | None] = mapped_column(ForeignKey("classificacao_oficial.id"))
    versao: Mapped[str]  # ex.: Portaria STN/SOF, MCASP 11ª ed.
    vigencia_inicio: Mapped[int]  # exercício
    vigencia_fim: Mapped[int | None]
    atributos: Mapped[Jsonb] = mapped_column(server_default=text("'{}'::jsonb"))


class ClassificacaoEquivalencia(Base):
    __tablename__ = "classificacao_equivalencia"
    __table_args__ = (
        UniqueConstraint("origem_id", "destino_id"),
        check_in("cardinalidade", "1:1", "1:N", "N:1", "N:M"),
        check_in("tipo_relacao", "identica", "renomeada", "desmembrada", "fundida", "parcial"),
    )

    id: Mapped[IntPK]
    origem_id: Mapped[int] = mapped_column(ForeignKey("classificacao_oficial.id"))
    destino_id: Mapped[int] = mapped_column(ForeignKey("classificacao_oficial.id"))
    cardinalidade: Mapped[str]
    tipo_relacao: Mapped[str]
    regra_harmonizacao: Mapped[Texto]
    fator_rateio: Mapped[Decimal | None] = mapped_column(Numeric(7, 6))
    fundamento: Mapped[Texto]  # portaria / MCASP


class PeriodoReferencia(Base):
    __tablename__ = "periodo_referencia"
    __table_args__ = (
        UniqueConstraint(
            "tipo_periodo", "data_inicio", "data_fim", "data_referencia",
            postgresql_nulls_not_distinct=True,
        ),
        # 'quadrimestral' não está no MER, mas o RGF de municípios > 50 mil hab. é quadrimestral
        check_in("tipo_periodo", "anual", "quadrimestral", "bimestral", "mensal", "pontual"),
    )

    id: Mapped[IntPK]
    ano: Mapped[int]
    tipo_periodo: Mapped[str]
    sequencia: Mapped[int | None]  # bimestre/quadrimestre/mês; nulo se anual
    data_inicio: Mapped[date]
    data_fim: Mapped[date]
    data_referencia: Mapped[date | None]  # ex.: 1/jul para estimativa
    acumulado_no_exercicio: Mapped[bool] = mapped_column(server_default=false())


class IndicePrecosSerie(Base):
    __tablename__ = "indice_precos_serie"
    __table_args__ = (check_in("abrangencia", "nacional", "regiao_metropolitana"),)

    codigo: Mapped[str] = mapped_column(primary_key=True)  # IPCA
    nome: Mapped[str]
    orgao: Mapped[str]  # IBGE
    abrangencia: Mapped[str]


class IndicePrecosValor(DadoBruto, Base):
    __tablename__ = "indice_precos_valor"
    __table_args__ = (unico_versao_atual(__tablename__, "serie_codigo", "periodo_id"),)

    id: Mapped[BigIntPK]
    serie_codigo: Mapped[str] = mapped_column(ForeignKey("indice_precos_serie.codigo"))
    periodo_id: Mapped[int] = mapped_column(ForeignKey("periodo_referencia.id"))
    numero_indice: Mapped[Decimal] = mapped_column(Numeric(14, 6))


class Municipio(Base):
    __tablename__ = "municipio"

    codigo_ibge: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)  # 7 dígitos
    codigo_ibge6: Mapped[int]  # SIOPS / SIOPE
    nome: Mapped[str]
    uf: Mapped[str] = mapped_column(CHAR(2))
    data_instalacao: Mapped[date | None]


class UnidadeGestora(Base):
    __tablename__ = "unidade_gestora"
    __table_args__ = (
        UniqueConstraint("municipio_ibge", "nome"),
        check_in("poder", "executivo", "legislativo"),
        check_in(
            "tipo",
            "consolidado", "adm_direta", "autarquia", "fundacao", "fundo", "rpps", "empresa_dependente",
        ),
    )

    id: Mapped[IntPK]
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    nome: Mapped[str]
    poder: Mapped[str]
    tipo: Mapped[str]
    cnpj: Mapped[str | None]


class Gestao(Base):
    __tablename__ = "gestao"
    __table_args__ = (
        check_in("cargo", "prefeito", "vice_em_exercicio", "interino"),
        check_in("motivo_fim", "fim_mandato", "cassacao", "renuncia", "obito"),
        CheckConstraint("(fim IS NULL) = (motivo_fim IS NULL)", name="fim_com_motivo"),
    )

    id: Mapped[IntPK]
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    titular_nome: Mapped[str]
    cargo: Mapped[str]
    inicio: Mapped[date]
    fim: Mapped[date | None]
    motivo_fim: Mapped[str | None]
    coleta_id: Mapped[BigInt] = mapped_column(ForeignKey("coleta.id"))  # TSE / ato oficial


class PopulacaoObservacao(DadoBruto, Base):
    __tablename__ = "populacao_observacao"
    __table_args__ = (
        unico_versao_atual(__tablename__, "municipio_ibge", "periodo_id", "tipo"),
        check_in("tipo", "censo", "estimativa", "projecao"),
    )

    id: Mapped[BigIntPK]
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    quantidade: Mapped[int]
    tipo: Mapped[str]
    periodo_id: Mapped[int] = mapped_column(ForeignKey("periodo_referencia.id"))  # data_referencia
    metodologia_versao: Mapped[str]


class MunicipioAtributo(Base):
    __tablename__ = "municipio_atributo"
    __table_args__ = (
        UniqueConstraint("municipio_ibge", "periodo_id", "atributo"),
        CheckConstraint("num_nonnulls(valor_num, valor_txt) = 1", name="um_valor"),
        # bruto vem de uma coleta; derivado, de uma execução de metodologia
        CheckConstraint("num_nonnulls(coleta_id, execucao_id) = 1", name="coleta_ou_execucao"),
    )

    id: Mapped[BigIntPK]
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    periodo_id: Mapped[int] = mapped_column(ForeignKey("periodo_referencia.id"))
    atributo: Mapped[str]  # porte, regiao, dependencia_transf, pib_pc
    valor_num: Mapped[Decimal | None]
    valor_txt: Mapped[str | None]
    coleta_id: Mapped[BigInt | None] = mapped_column(ForeignKey("coleta.id"))
    execucao_id: Mapped[BigInt | None] = mapped_column(ForeignKey("execucao_metodologia.id"))


class GrupoPares(Base):
    __tablename__ = "grupo_pares"

    id: Mapped[IntPK]
    nome: Mapped[str]
    descricao: Mapped[Texto]


class GrupoParesVersao(Base):
    __tablename__ = "grupo_pares_versao"
    __table_args__ = (
        UniqueConstraint("grupo_id", "versao"),
        check_in("modo_composicao", "fixo", "por_ano", "atual"),
    )

    id: Mapped[IntPK]
    grupo_id: Mapped[int] = mapped_column(ForeignKey("grupo_pares.id"))
    versao: Mapped[int]
    data_referencia_classificacao: Mapped[date]
    modo_composicao: Mapped[str]
    criterios: Mapped[Jsonb]  # [{atributo, operador, valor}]
    justificativa: Mapped[Texto]
    vigencia_inicio: Mapped[int]
    vigencia_fim: Mapped[int | None]


class GrupoParesMembro(Base):
    __tablename__ = "grupo_pares_membro"

    versao_id: Mapped[int] = mapped_column(ForeignKey("grupo_pares_versao.id"), primary_key=True)
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"), primary_key=True)
    # ano em que atendeu ao critério
    periodo_id: Mapped[int] = mapped_column(ForeignKey("periodo_referencia.id"), primary_key=True)
    valores_criterio: Mapped[Jsonb]  # snapshot
    justificativa_inclusao: Mapped[Texto | None]
