"""Uso (a partir de backend/):

    python -m etl siconfi                  # coleta incremental, janela de 3 gestões
    python -m etl siconfi --desde 2024     # só 2024 em diante (nunca antes da janela)
    python -m etl siconfi --forcar         # reverifica todos os relatórios (pelo hash)
    python -m etl transformar              # classificações oficiais + DESPESA
    python -m etl tce                      # TCE-PR: empenhos, contratos, licitações (gestão atual) e obras
    python -m etl tce --tema Despesa --desde 2025
    python -m etl ibge                     # população (estimativas e Censo)
    python -m etl tce-painel               # apurações do TCE-PR (pessoal, educação, saúde), anos fechados
    python -m etl podar                    # apaga o que saiu da janela de gestões
"""

import argparse
import logging
import sys
from datetime import date

from app.db import engine
from app.models import Base
from etl import apuracao, classificacao, despesa, ibge, janela, podar, siconfi, tce, tce_painel
from etl.http import cliente


def desde_na_janela(desde: int | None, inicio: int) -> int:
    if desde is not None and desde < inicio:
        logging.warning("--desde %d está fora da janela de gestões; usando %d", desde, inicio)
    return max(desde or inicio, inicio)


def coletar_siconfi(args) -> int:
    with cliente() as http:
        falhas = siconfi.executar(http, desde_na_janela(args.desde, janela.primeiro_exercicio()), args.ate, args.forcar)
    if falhas:
        logging.error("%d coleta(s) falharam", falhas)
    return 1 if falhas else 0


def coletar_tce(args) -> int:
    with engine.begin() as conn:
        classificacao.carregar_funcoes_subfuncoes(conn)  # empenhos referenciam funções/subfunções
    with cliente() as http:
        temas = args.tema or list(tce.TEMAS)
        falhas = 0
        # detalhe: só a gestão atual; temas pequenos (obras): janela geral de 3 gestões
        for geral in (False, True):
            do_grupo = [t for t in temas if (t in tce.TEMAS_JANELA_GERAL) == geral]
            if do_grupo:
                inicio = janela.primeiro_exercicio() if geral else janela.primeiro_exercicio_detalhe()
                falhas += tce.executar(
                    http, desde_na_janela(args.desde, inicio), args.ate, do_grupo, args.forcar, args.recarregar
                )
    if falhas:
        logging.error("%d coleta(s) falharam", falhas)
    return 1 if falhas else 0


def coletar_painel(_args) -> int:
    with cliente() as http:
        falhas = tce_painel.executar(http, janela.primeiro_exercicio(), date.today().year - 1)
    return 1 if falhas else 0


def coletar_ibge(_args) -> int:
    with cliente() as http:
        falhas = ibge.executar(http, janela.primeiro_exercicio(), date.today().year)
    return 1 if falhas else 0


def transformar(_args) -> int:
    refs = siconfi.preparar_referencias()
    with engine.begin() as conn:
        n = classificacao.carregar_funcoes_subfuncoes(conn)
        logging.info("classificação oficial: %d funções/subfunções", n)
        despesa.transformar(conn, refs.fontes)
        apuracao.transformar_rgf(conn, refs.fontes["RGF"])
    return 0


def podar_fora_da_janela(_args) -> int:
    with engine.begin() as conn:
        podar.podar(conn, janela.primeiro_exercicio(), janela.primeiro_exercicio_detalhe())
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m etl")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="comando", required=True)

    p = sub.add_parser("siconfi", help="coleta RREO, RGF, DCA e extrato de entregas do Siconfi")
    p.add_argument("--desde", type=int)
    p.add_argument("--ate", type=int, default=date.today().year)
    p.add_argument("--forcar", action="store_true", help="ignora a janela de reverificação")
    p.set_defaults(executar=coletar_siconfi)

    p = sub.add_parser("tce", help="coleta empenhos, contratos e licitações do TCE-PR (PIT)")
    p.add_argument("--desde", type=int)
    p.add_argument("--ate", type=int, default=date.today().year)
    p.add_argument("--tema", action="append", choices=list(tce.TEMAS))
    p.add_argument("--forcar", action="store_true", help="baixa mesmo sem mudança no Last-Modified")
    p.add_argument("--recarregar", action="store_true", help="carrega mesmo sem mudança no conteúdo")
    p.set_defaults(executar=coletar_tce)

    p = sub.add_parser("tce-painel", help="apurações do TCE-PR por exercício fechado (painel do PIT)")
    p.set_defaults(executar=coletar_painel)

    p = sub.add_parser("ibge", help="coleta população (estimativas e Censo) do IBGE")
    p.set_defaults(executar=coletar_ibge)

    p = sub.add_parser("transformar", help="gera as tabelas estruturadas a partir dos dados brutos")
    p.set_defaults(executar=transformar)

    p = sub.add_parser("podar", help="apaga o que saiu da janela de gestões")
    p.set_defaults(executar=podar_fora_da_janela)

    args = parser.parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logging.getLogger("httpx").setLevel(logging.INFO if args.verbose else logging.WARNING)

    # Para produção, troque por migrações (ex.: Alembic)
    Base.metadata.create_all(bind=engine)
    return args.executar(args)


if __name__ == "__main__":
    sys.exit(main())
