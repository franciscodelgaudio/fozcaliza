"""Camada azul do MER: execução detalhada declarada ao TCE-PR (SIM-AM).

Fonte: "Download de Dados" do Portal Informação para Todos (pit.tce.pr.gov.br),
um arquivo por município, ano e tema. `ano` é o exercício do arquivo de
origem e delimita o que cada carga cobre. `id_tce` é o identificador do
registro no SIM-AM.

Valores de empenho são os publicados (empenhado bruto, sem anulações). O
quanto foi liquidado e pago, e quando, sai de EMPENHO_MOVIMENTO, cujas datas
permitem separar o que foi pago no exercício do que foi pago depois (restos a
pagar). Não compare somas daqui com o DCA sem esse recorte.

Só a gestão atual é mantida (etl/janela.py). Pagamentos de restos a pagar de
empenhos anteriores a ela estão em EMPENHO_MOVIMENTO, mas sem o empenho (e o
credor) correspondente: em 2025, R$ 45 mi (2,1% do pago no ano).
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import ForeignKey, Index, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    Base,
    BigInt,
    BigIntPK,
    DadoBruto,
    Texto,
    check_in,
    fk_classificacao,
    tipo_classificacao,
    unico_versao_atual,
)


class Empenho(DadoBruto, Base):
    __tablename__ = "empenho"
    __table_args__ = (
        unico_versao_atual(__tablename__, "id_tce"),
        Index("ix_empenho_ano_unidade", "ano", "unidade_gestora_id"),
        Index("ix_empenho_credor", "credor_id"),
        fk_classificacao("funcao"),
        fk_classificacao("subfuncao"),
    )

    id: Mapped[BigIntPK]
    id_tce: Mapped[BigInt]
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    unidade_gestora_id: Mapped[int] = mapped_column(ForeignKey("unidade_gestora.id"))
    ano: Mapped[int]
    numero: Mapped[int]
    data: Mapped[date]
    tipo: Mapped[str]  # Ordinário | Global | Estimativa
    # nulo: a entidade não informou o credor ao TCE (ocorre, raramente)
    credor_id: Mapped[int | None] = mapped_column(ForeignKey("credor.id"))
    funcao_id: Mapped[int]
    funcao_tipo: Mapped[str] = tipo_classificacao("funcao")
    subfuncao_id: Mapped[int]
    subfuncao_tipo: Mapped[str] = tipo_classificacao("subfuncao")
    # categoria.grupo.modalidade.elemento.desdobramento.detalhamento (ex.: 3.1.90.13.99.01)
    natureza_codigo: Mapped[str]
    natureza_descricao: Mapped[str]
    intraorcamentaria: Mapped[bool]  # modalidade 91
    fonte_recurso_codigo: Mapped[str]
    fonte_recurso_descricao: Mapped[str]
    orgao_codigo: Mapped[str]
    orgao_nome: Mapped[str]
    unidade_orcamentaria_codigo: Mapped[str]
    unidade_orcamentaria_nome: Mapped[str]
    programa_codigo: Mapped[str]
    acao_codigo: Mapped[str]
    acao_descricao: Mapped[str]
    historico: Mapped[Texto | None]
    valor: Mapped[Decimal] = mapped_column(Numeric(15, 2))


class EmpenhoMovimento(DadoBruto, Base):
    """Liquidações, pagamentos e seus estornos. Estornos têm valor positivo;
    o tipo diz que reduzem a liquidação ou o pagamento."""

    __tablename__ = "empenho_movimento"
    __table_args__ = (
        unico_versao_atual(__tablename__, "tipo", "id_tce"),
        Index("ix_empenho_movimento_empenho", "empenho_id_tce"),
        Index("ix_empenho_movimento_ano", "ano"),
        check_in("tipo", "liquidacao", "estorno_liquidacao", "pagamento", "estorno_pagamento"),
    )

    id: Mapped[BigIntPK]
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    ano: Mapped[int]
    tipo: Mapped[str]
    id_tce: Mapped[BigInt]
    empenho_id_tce: Mapped[BigInt]
    data: Mapped[date]
    valor: Mapped[Decimal] = mapped_column(Numeric(15, 2))


class Contrato(DadoBruto, Base):
    __tablename__ = "contrato"
    __table_args__ = (
        unico_versao_atual(__tablename__, "id_tce"),
        Index("ix_contrato_credor", "credor_id"),
    )

    id: Mapped[BigIntPK]
    id_tce: Mapped[BigInt]
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    unidade_gestora_id: Mapped[int] = mapped_column(ForeignKey("unidade_gestora.id"))
    ano: Mapped[int]
    numero: Mapped[str]
    ano_contrato: Mapped[int]
    credor_id: Mapped[int] = mapped_column(ForeignKey("credor.id"))  # contratado
    objeto: Mapped[Texto]
    valor: Mapped[Decimal] = mapped_column(Numeric(15, 2))  # original, sem aditivos
    data_assinatura: Mapped[date | None]
    data_inicio: Mapped[date | None]
    data_fim: Mapped[date | None]


class ContratoAditivo(DadoBruto, Base):
    """Um aditivo pode ter mais de uma operação (ex.: acréscimo e supressão
    no mesmo termo); cada operação é uma linha."""

    __tablename__ = "contrato_aditivo"
    __table_args__ = (
        unico_versao_atual(__tablename__, "contrato_id_tce", "ano_aditivo", "numero", "operacao"),
        Index("ix_contrato_aditivo_ano", "ano"),
    )

    id: Mapped[BigIntPK]
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    ano: Mapped[int]
    contrato_id_tce: Mapped[BigInt]
    numero: Mapped[int]
    ano_aditivo: Mapped[int]
    tipo: Mapped[str]
    operacao: Mapped[str | None]
    valor: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    valor_contrato_atualizado: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    nova_data_fim: Mapped[date | None]
    data: Mapped[date | None]


class Licitacao(DadoBruto, Base):
    __tablename__ = "licitacao"
    __table_args__ = (unico_versao_atual(__tablename__, "id_tce"),)

    id: Mapped[BigIntPK]
    id_tce: Mapped[BigInt]
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    unidade_gestora_id: Mapped[int] = mapped_column(ForeignKey("unidade_gestora.id"))
    ano: Mapped[int]
    modalidade: Mapped[str]
    numero: Mapped[str]
    ano_licitacao: Mapped[int]
    objeto: Mapped[Texto]
    valor: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))  # estimado
    situacao: Mapped[str | None]
    natureza: Mapped[str | None]
    data_abertura: Mapped[date | None]


class Vinculo(DadoBruto, Base):
    """Vínculos publicados pelo TCE-PR entre empenho, contrato e licitação.
    São ids do SIM-AM, não FKs: o registro vinculado pode ser de outro ano."""

    __tablename__ = "vinculo"
    __table_args__ = (
        # o mesmo par aparece nos arquivos de anos diferentes
        unico_versao_atual(__tablename__, "ano", "tipo", "origem_id_tce", "destino_id_tce"),
        Index("ix_vinculo_destino", "tipo", "destino_id_tce"),
        Index("ix_vinculo_ano", "ano"),
        check_in("tipo", "empenho_contrato", "empenho_licitacao", "licitacao_contrato"),
    )

    id: Mapped[BigIntPK]
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    ano: Mapped[int]
    tipo: Mapped[str]
    origem_id_tce: Mapped[BigInt]
    destino_id_tce: Mapped[BigInt]


class Obra(DadoBruto, Base):
    """Obras (intervenções) declaradas ao TCE-PR. O arquivo de cada ano traz as
    obras iniciadas nele; a situação é a da data do arquivo. Valor de R$ 0,01
    aparece quando a entidade não informou o valor de fato."""

    __tablename__ = "obra"
    __table_args__ = (
        unico_versao_atual(__tablename__, "id_tce"),
        Index("ix_obra_ano", "ano"),
    )

    id: Mapped[BigIntPK]
    id_tce: Mapped[BigInt]
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    unidade_gestora_id: Mapped[int] = mapped_column(ForeignKey("unidade_gestora.id"))
    ano: Mapped[int]
    numero: Mapped[int]
    nome: Mapped[Texto]
    valor: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    data_inicio: Mapped[date | None]
    prazo_dias: Mapped[int | None]
    regime: Mapped[str | None]  # Direto | Indireto
    situacao: Mapped[str]  # Em andamento | Concluída | Paralisada | Não iniciada
    data_ultima_medicao: Mapped[date | None]


class ObraLocal(DadoBruto, Base):
    """Bens (locais) de cada obra, com as coordenadas como publicadas e
    convertidas para graus decimais (negativos: Sul e Oeste). `sequencia` é a
    posição do local na obra: até 2021 a fonte não trazia o id do bem."""

    __tablename__ = "obra_local"
    __table_args__ = (
        unico_versao_atual(__tablename__, "obra_id_tce", "sequencia"),
        Index("ix_obra_local_ano", "ano"),
    )

    id: Mapped[BigIntPK]
    municipio_ibge: Mapped[int] = mapped_column(ForeignKey("municipio.codigo_ibge"))
    ano: Mapped[int]
    obra_id_tce: Mapped[BigInt]
    sequencia: Mapped[int]
    id_bem: Mapped[BigInt | None]
    descricao: Mapped[Texto | None]
    logradouro: Mapped[Texto | None]
    coordenada: Mapped[str | None]
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
