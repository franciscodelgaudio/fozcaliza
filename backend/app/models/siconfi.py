from decimal import Decimal

from sqlalchemy import CHAR, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BigIntPK, Base, DadoBruto, Texto, check_in, unico_versao_atual


class SiconfiLinha(DadoBruto, Base):
    """Linha de RREO/RGF/DCA exatamente como publicada pela API do Siconfi.

    Camada de pouso: DESPESA, RECEITA e APURACAO_OFICIAL são derivadas daqui,
    o que permite reprocessar regras de classificação sem baixar tudo de novo.
    `chave` é o sha256 da identidade da linha (relatório + anexo + rótulo +
    conta + coluna), que é única dentro de cada relatório publicado.
    """

    __tablename__ = "siconfi_linha"
    __table_args__ = (
        unico_versao_atual("siconfi_linha", "chave"),
        Index(
            "ix_siconfi_linha_relatorio",
            "municipio_ibge", "demonstrativo", "exercicio", "periodo",
        ),
        check_in("demonstrativo", "RREO", "RGF", "DCA"),
    )

    id: Mapped[BigIntPK]
    chave: Mapped[str] = mapped_column(String(64))
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    demonstrativo: Mapped[str]
    exercicio: Mapped[int]
    periodicidade: Mapped[str] = mapped_column(CHAR(1))  # A | B | Q | S
    periodo: Mapped[int]
    co_poder: Mapped[str | None] = mapped_column(CHAR(1))  # só RGF: E | L
    instituicao: Mapped[Texto]
    anexo: Mapped[Texto]
    rotulo: Mapped[Texto]
    cod_conta: Mapped[Texto]
    conta: Mapped[Texto]
    coluna: Mapped[Texto]
    valor: Mapped[Decimal | None] = mapped_column(Numeric)  # sem escala: fiel à fonte
