"""Janela de dados: a gestão municipal atual e as duas anteriores, no máximo.

Mandatos municipais começam em 1º de janeiro de 2017, 2021, 2025, 2029...
(anos em que ano % 4 == 1). Em 2026 a janela é 2017-2028; em 2029 passa a
ser 2021-2032. Vale para todas as fontes; o que sair da janela é apagado
por `python -m etl podar` (pode ser coletado de novo da fonte se preciso).
"""

from datetime import date

GESTOES = 3


def inicio_gestao_atual(hoje: date | None = None) -> int:
    ano = (hoje or date.today()).year
    return ano - (ano - 1) % 4


def primeiro_exercicio(hoje: date | None = None) -> int:
    return inicio_gestao_atual(hoje) - 4 * (GESTOES - 1)
