"""Importa todas as camadas do MER para registrá-las no metadata."""

from app.models.base import Base
from app.models.bruto import ApuracaoOficial, Despesa, Receita, ResultadoObservacao
from app.models.derivado import (
    ExecucaoColeta,
    ExecucaoMetodologia,
    Indicador,
    IndicadorMetodologia,
    IndicadorValor,
    NotaSerie,
)
from app.models.execucao import (
    ContratoAditivo,
    Contrato,
    Empenho,
    EmpenhoMovimento,
    Licitacao,
    Vinculo,
)
from app.models.item import Item
from app.models.proveniencia import Coleta, EntregaDemonstrativo, Fonte
from app.models.referencia import (
    ClassificacaoEquivalencia,
    ClassificacaoOficial,
    Credor,
    Gestao,
    GrupoPares,
    GrupoParesMembro,
    GrupoParesVersao,
    IndicePrecosSerie,
    IndicePrecosValor,
    Municipio,
    MunicipioAtributo,
    PeriodoReferencia,
    PopulacaoObservacao,
    UnidadeGestora,
)
from app.models.siconfi import SiconfiLinha

__all__ = [
    "ApuracaoOficial",
    "Base",
    "ClassificacaoEquivalencia",
    "ClassificacaoOficial",
    "Coleta",
    "Contrato",
    "ContratoAditivo",
    "Credor",
    "Despesa",
    "Empenho",
    "EmpenhoMovimento",
    "EntregaDemonstrativo",
    "ExecucaoColeta",
    "ExecucaoMetodologia",
    "Fonte",
    "Gestao",
    "GrupoPares",
    "GrupoParesMembro",
    "GrupoParesVersao",
    "Indicador",
    "IndicadorMetodologia",
    "IndicadorValor",
    "IndicePrecosSerie",
    "IndicePrecosValor",
    "Item",
    "Licitacao",
    "Municipio",
    "MunicipioAtributo",
    "NotaSerie",
    "PeriodoReferencia",
    "PopulacaoObservacao",
    "Receita",
    "ResultadoObservacao",
    "SiconfiLinha",
    "UnidadeGestora",
    "Vinculo",
]
