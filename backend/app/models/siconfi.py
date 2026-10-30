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
    `ocorrencia` distingue linhas idênticas na identidade dentro do mesmo
    relatório: até 2017 o RREO Anexo 02 repetia "Administração Geral" e "Demais
    Subfunções" sob várias funções, sem prefixo; é 1 em todo o resto.
    `ordem` é a posição da linha na resposta da API, que segue o relatório:
    no RREO Anexo 02, por exemplo, é ela que diz a qual função pertence uma
    subfunção. Não é valor: é atualizada no lugar, sem gerar versão.
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
    rotulo: Mapped[Texto | None]  # a fonte não o preenchia até 2017
    cod_conta: Mapped[Texto]
    conta: Mapped[Texto]
    coluna: Mapped[Texto]
    ocorrencia: Mapped[int]
    ordem: Mapped[int]
    valor: Mapped[Decimal | None] = mapped_column(Numeric)  # sem escala: fiel à fonte
