"""Camada azul do MER: dado bruto, nominal e fiel à fonte."""

from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    Base,
    BigIntPK,
    DadoBruto,
    check_in,
    fk_classificacao,
    tipo_classificacao,
    unico_versao_atual,
)


class Despesa(DadoBruto, Base):
    __tablename__ = "despesa"
    __table_args__ = (
        unico_versao_atual(
            __tablename__,
            "municipio_ibge", "unidade_gestora_id", "periodo_id", "fonte_id",
            "demonstrativo", "nivel_detalhe", "funcao_id", "subfuncao_id",
            "natureza_despesa_id", "fonte_recurso_id", "programa_codigo",
            "acao_codigo", "estagio",
        ),
        fk_classificacao("funcao"),
        fk_classificacao("subfuncao"),
        fk_classificacao("natureza_despesa"),
        fk_classificacao("fonte_recurso"),
        check_in("demonstrativo", "RREO-A2", "DCA-I-E", "MSC", "TCE"),
        check_in("nivel_detalhe", "funcao", "subfuncao", "elemento"),
    )

    id: Mapped[BigIntPK]
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    unidade_gestora_id: Mapped[int] = mapped_column(ForeignKey("unidade_gestora.id"))
    periodo_id: Mapped[int] = mapped_column(ForeignKey("periodo_referencia.id"))
    fonte_id: Mapped[int] = mapped_column(ForeignKey("fonte.id"))
    demonstrativo: Mapped[str]
    nivel_detalhe: Mapped[str]
    funcao_id: Mapped[int]
    funcao_tipo: Mapped[str] = tipo_classificacao("funcao")
    subfuncao_id: Mapped[int | None]
    subfuncao_tipo: Mapped[str] = tipo_classificacao("subfuncao")
    natureza_despesa_id: Mapped[int | None]
    natureza_despesa_tipo: Mapped[str] = tipo_classificacao("natureza_despesa")
    fonte_recurso_id: Mapped[int | None]
    fonte_recurso_tipo: Mapped[str] = tipo_classificacao("fonte_recurso")
    programa_codigo: Mapped[str | None]
    acao_codigo: Mapped[str | None]
    intraorcamentaria: Mapped[bool]
    estagio: Mapped[str]
    valor: Mapped[Decimal] = mapped_column(Numeric(15, 2))


class Receita(DadoBruto, Base):
    __tablename__ = "receita"
    __table_args__ = (
        unico_versao_atual(
            __tablename__,
            "municipio_ibge", "unidade_gestora_id", "periodo_id", "fonte_id",
            "demonstrativo", "nivel_detalhe", "natureza_receita_id",
            "fonte_recurso_id", "base", "tipo_deducao", "estagio",
        ),
        fk_classificacao("natureza_receita"),
        fk_classificacao("fonte_recurso"),
        check_in("base", "bruta", "deducao"),
        check_in("estagio", "prevista", "atualizada", "arrecadada"),
        CheckConstraint("base = 'deducao' OR tipo_deducao IS NULL", name="tipo_deducao_so_em_deducao"),
    )

    id: Mapped[BigIntPK]
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    unidade_gestora_id: Mapped[int] = mapped_column(ForeignKey("unidade_gestora.id"))
    periodo_id: Mapped[int] = mapped_column(ForeignKey("periodo_referencia.id"))
    fonte_id: Mapped[int] = mapped_column(ForeignKey("fonte.id"))
    demonstrativo: Mapped[str]
    nivel_detalhe: Mapped[str]
    natureza_receita_id: Mapped[int]
    natureza_receita_tipo: Mapped[str] = tipo_classificacao("natureza_receita")
    fonte_recurso_id: Mapped[int | None]
    fonte_recurso_tipo: Mapped[str] = tipo_classificacao("fonte_recurso")
    intraorcamentaria: Mapped[bool]
    base: Mapped[str]
    tipo_deducao: Mapped[str | None]
    estagio: Mapped[str]
    valor: Mapped[Decimal] = mapped_column(Numeric(15, 2))


class ApuracaoOficial(DadoBruto, Base):
    """RCL, DTP, DCL e mínimos constitucionais como publicados (RGF, RREO,
    SIOPS, SIOPE). Não recalcular a partir de DESPESA."""

    __tablename__ = "apuracao_oficial"
    __table_args__ = (
        unico_versao_atual(__tablename__, "municipio_ibge", "periodo_id", "fonte_id", "poder", "item"),
        check_in("poder", "executivo", "legislativo", "consolidado"),
        check_in("item", "RCL", "DTP", "DCL", "MDE", "ASPS", "FUNDEB_70"),
    )

    id: Mapped[BigIntPK]
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    periodo_id: Mapped[int] = mapped_column(ForeignKey("periodo_referencia.id"))
    fonte_id: Mapped[int] = mapped_column(ForeignKey("fonte.id"))
    poder: Mapped[str]
    item: Mapped[str]
    numerador: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    denominador: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    percentual_apurado: Mapped[Decimal | None] = mapped_column(Numeric(7, 4))
    limite_ou_minimo: Mapped[Decimal | None] = mapped_column(Numeric(7, 4))
    base_legal: Mapped[str]
    metodologia_apuracao: Mapped[str]


class ResultadoObservacao(DadoBruto, Base):
    __tablename__ = "resultado_observacao"
    __table_args__ = (
        unico_versao_atual(__tablename__, "municipio_ibge", "periodo_id", "fonte_id", "variavel", "recorte"),
    )

    id: Mapped[BigIntPK]
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    periodo_id: Mapped[int] = mapped_column(ForeignKey("periodo_referencia.id"))
    fonte_id: Mapped[int] = mapped_column(ForeignKey("fonte.id"))
    variavel: Mapped[str]
    recorte: Mapped[str]
    valor: Mapped[Decimal]
    unidade: Mapped[str]
