"""Janelas de dados, em gestões municipais.

Mandatos municipais começam em 1º de janeiro de 2017, 2021, 2025, 2029...
(anos em que ano % 4 == 1).

- Geral: a gestão atual e as duas anteriores, no máximo (em 2026, 2017-2028;
  em 2029, 2021-2032). Vale para todas as fontes.
- Detalhe (empenhos, pagamentos, contratos e licitações do TCE-PR): só a
  gestão atual, pelo volume (~60 MB por ano). As gestões anteriores ficam com
  a visão por função/subfunção (DESPESA do Siconfi).

O que sai de uma janela é apagado por `python -m etl podar` (pode ser
coletado de novo da fonte se preciso).
"""

from datetime import date

GESTOES = 3


def inicio_gestao_atual(hoje: date | None = None) -> int:
    ano = (hoje or date.today()).year
    return ano - (ano - 1) % 4


def primeiro_exercicio(hoje: date | None = None) -> int:
    return inicio_gestao_atual(hoje) - 4 * (GESTOES - 1)


def primeiro_exercicio_detalhe(hoje: date | None = None) -> int:
    return inicio_gestao_atual(hoje)
