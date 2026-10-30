"""Camada cinza do MER: proveniência e cobertura."""

from datetime import date, datetime

from sqlalchemy import ForeignKey, Index, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BigInt, BigIntPK, IntPK, Jsonb, check_in


class Fonte(Base):
    __tablename__ = "fonte"
    __table_args__ = (UniqueConstraint("sistema", "dataset"),)

    id: Mapped[IntPK]
    orgao: Mapped[str]  # STN, MS, FNDE, IBGE, TCE-PR
    sistema: Mapped[str]  # Siconfi, SIOPS, SIOPE, SIDRA
    dataset: Mapped[str]  # RREO, RGF, DCA, MSC, Estimativas
    url_documentacao: Mapped[str]


class Coleta(Base):
    __tablename__ = "coleta"
    __table_args__ = (
        Index("ix_coleta_requisicao", "fonte_id", "endpoint", "executada_em"),
        check_in("status", "sucesso", "parcial", "falha"),
    )

    id: Mapped[BigIntPK]
    fonte_id: Mapped[int] = mapped_column(ForeignKey("fonte.id"))
    endpoint: Mapped[str]
    parametros_requisicao: Mapped[Jsonb]
    arquivo_original_uri: Mapped[str | None]
    hash_conteudo: Mapped[str | None]  # nulo em falha
    periodo_coberto_inicio: Mapped[date | None]
    periodo_coberto_fim: Mapped[date | None]
    versao_ingestao: Mapped[str]  # git sha do ETL
    executada_em: Mapped[datetime] = mapped_column(server_default=func.now())
    status: Mapped[str]


class EntregaDemonstrativo(Base):
    __tablename__ = "entrega_demonstrativo"
    __table_args__ = (
        # unidade_gestora_id não está no MER: Prefeitura e Câmara entregam RGF
        # (e MSC) separadamente para o mesmo período
        UniqueConstraint("municipio_ibge", "periodo_id", "fonte_id", "demonstrativo", "unidade_gestora_id"),
        check_in("demonstrativo", "RREO", "RGF", "DCA", "MSC", "SIOPS", "SIOPE"),
        check_in("status", "entregue", "homologado", "retificado", "nao_entregue"),
    )

    id: Mapped[BigIntPK]
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    unidade_gestora_id: Mapped[int] = mapped_column(ForeignKey("unidade_gestora.id"))
    periodo_id: Mapped[int] = mapped_column(ForeignKey("periodo_referencia.id"))
    fonte_id: Mapped[int] = mapped_column(ForeignKey("fonte.id"))
    demonstrativo: Mapped[str]
    status: Mapped[str]
    data_entrega: Mapped[date | None]
    data_homologacao: Mapped[date | None]
    coleta_id: Mapped[BigInt] = mapped_column(ForeignKey("coleta.id"))
