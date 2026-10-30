"""Camada lilás do MER: indicadores calculados a partir dos dados brutos."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Numeric,
    UniqueConstraint,
    false,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BigInt, BigIntPK, Jsonb, Texto, check_in

METODOLOGIA_PK = ["indicador_metodologia.indicador_codigo", "indicador_metodologia.versao"]


class Indicador(Base):
    __tablename__ = "indicador"
    __table_args__ = (check_in("tipo", "gasto", "receita", "fiscal", "resultado", "contexto"),)

    codigo: Mapped[str] = mapped_column(primary_key=True)
    nome: Mapped[str]
    tipo: Mapped[str]
    descricao_publica: Mapped[Texto]


class IndicadorMetodologia(Base):
    __tablename__ = "indicador_metodologia"
    __table_args__ = (
        check_in("agregacao", "soma", "razao", "percentual", "variacao"),
        check_in("estagio", "empenhada", "liquidada", "paga"),
        check_in("base_populacional", "estimativa", "censo"),
        check_in("deflator_regra", "media_ano", "dezembro"),
        check_in("direcao_interpretacao", "maior_melhor", "menor_melhor", "neutro"),
        CheckConstraint("(deflator_serie IS NULL) = (deflator_regra IS NULL)", name="deflator_completo"),
    )

    indicador_codigo: Mapped[str] = mapped_column(ForeignKey("indicador.codigo"), primary_key=True)
    versao: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    numerador_descricao: Mapped[Texto]
    # nulo em agregação 'soma' (sem denominador)
    denominador_descricao: Mapped[Texto | None]
    formula: Mapped[Texto]
    agregacao: Mapped[str]
    unidade_medida: Mapped[str]
    escopo: Mapped[str]
    # nulos quando não se aplicam (indicador que não é de gasto / não per capita)
    estagio: Mapped[str | None]
    demonstrativo_canonico: Mapped[str]
    filtros: Mapped[Jsonb] = mapped_column(server_default=text("'{}'::jsonb"))
    base_populacional: Mapped[str | None]
    deflator_serie: Mapped[str | None] = mapped_column(ForeignKey("indice_precos_serie.codigo"))
    deflator_regra: Mapped[str | None]
    ano_base_deflacao: Mapped[int | None]
    direcao_interpretacao: Mapped[str]
    regra_valores_ausentes: Mapped[Texto]
    criterio_comparabilidade: Mapped[Texto]
    exige_exercicio_completo: Mapped[bool]
    regra_atribuicao_gestao: Mapped[Texto]
    limitacoes: Mapped[Texto]
    vigencia_inicio: Mapped[date]
    vigencia_fim: Mapped[date | None]


class ExecucaoMetodologia(Base):
    __tablename__ = "execucao_metodologia"
    __table_args__ = (
        ForeignKeyConstraint(["indicador_codigo", "metodologia_versao"], METODOLOGIA_PK),
        # alvo da FK composta de INDICADOR_VALOR
        UniqueConstraint("id", "indicador_codigo", "metodologia_versao"),
        check_in("status", "sucesso", "parcial", "falha"),
    )

    id: Mapped[BigIntPK]
    indicador_codigo: Mapped[str]
    metodologia_versao: Mapped[int]
    executado_em: Mapped[datetime] = mapped_column(server_default=func.now())
    data_corte: Mapped[datetime]
    parametros: Mapped[Jsonb] = mapped_column(server_default=text("'{}'::jsonb"))
    versao_codigo: Mapped[str]
    status: Mapped[str]
    log_resumo: Mapped[Texto]


class ExecucaoColeta(Base):
    __tablename__ = "execucao_coleta"

    execucao_id: Mapped[BigInt] = mapped_column(ForeignKey("execucao_metodologia.id"), primary_key=True)
    coleta_id: Mapped[BigInt] = mapped_column(ForeignKey("coleta.id"), primary_key=True)


class IndicadorValor(Base):
    __tablename__ = "indicador_valor"
    __table_args__ = (
        # garante que o indicador/metodologia do valor é o mesmo da execução
        ForeignKeyConstraint(
            ["execucao_id", "indicador_codigo", "metodologia_versao"],
            [
                "execucao_metodologia.id",
                "execucao_metodologia.indicador_codigo",
                "execucao_metodologia.metodologia_versao",
            ],
        ),
        ForeignKeyConstraint(["indicador_codigo", "metodologia_versao"], METODOLOGIA_PK),
        UniqueConstraint(
            "execucao_id", "indicador_codigo", "municipio_ibge", "grupo_pares_versao_id", "periodo_id",
            postgresql_nulls_not_distinct=True,
        ),
        check_in("status_qualidade", "completo", "parcial", "ausente", "estimado"),
        CheckConstraint("num_nonnulls(municipio_ibge, grupo_pares_versao_id) >= 1", name="municipio_ou_grupo"),
        # ausência ≠ zero: só 'ausente' pode ficar sem valor
        CheckConstraint("valor IS NOT NULL OR status_qualidade = 'ausente'", name="valor_ou_ausente"),
        CheckConstraint("cobertura BETWEEN 0 AND 1", name="cobertura_fracao"),
    )

    id: Mapped[BigIntPK]
    execucao_id: Mapped[BigInt]
    indicador_codigo: Mapped[str]
    metodologia_versao: Mapped[int]
    municipio_ibge: Mapped[int | None] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    grupo_pares_versao_id: Mapped[int | None] = mapped_column(ForeignKey("grupo_pares_versao.id"))
    periodo_id: Mapped[int] = mapped_column(ForeignKey("periodo_referencia.id"))
    gestao_id: Mapped[int | None] = mapped_column(ForeignKey("gestao.id"))
    numerador: Mapped[Decimal | None]
    denominador: Mapped[Decimal | None]
    valor: Mapped[Decimal | None]
    status_qualidade: Mapped[str]
    cobertura: Mapped[Decimal] = mapped_column(Numeric(5, 4))
    publicado: Mapped[bool] = mapped_column(server_default=false())


class NotaSerie(Base):
    """Quebras e ressalvas. gravidade = 'impede_comparacao' bloqueia a
    comparação no frontend."""

    __tablename__ = "nota_serie"
    __table_args__ = (
        ForeignKeyConstraint(["indicador_codigo", "metodologia_versao"], METODOLOGIA_PK),
        check_in("tipo", "quebra", "ressalva", "contexto", "correcao"),
        check_in("gravidade", "informativa", "impede_comparacao"),
        CheckConstraint(
            "metodologia_versao IS NULL OR indicador_codigo IS NOT NULL", name="versao_exige_indicador"
        ),
    )

    id: Mapped[BigIntPK]
    # nulo = vale para todos os municípios
    municipio_ibge: Mapped[int | None] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    indicador_codigo: Mapped[str | None] = mapped_column(ForeignKey("indicador.codigo"))
    metodologia_versao: Mapped[int | None]
    classificacao_id: Mapped[int | None] = mapped_column(ForeignKey("classificacao_oficial.id"))
    periodo_inicio_id: Mapped[int] = mapped_column(ForeignKey("periodo_referencia.id"))
    periodo_fim_id: Mapped[int | None] = mapped_column(ForeignKey("periodo_referencia.id"))
    tipo: Mapped[str]
    gravidade: Mapped[str]
    descricao: Mapped[Texto]
    fundamento_url: Mapped[str]
