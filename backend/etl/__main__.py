"""Uso (a partir de backend/):

    python -m etl siconfi                  # coleta incremental, janela de 3 gestões
    python -m etl siconfi --desde 2024     # só 2024 em diante (nunca antes da janela)
    python -m etl siconfi --forcar         # reverifica todos os relatórios (pelo hash)
    python -m etl transformar              # classificações oficiais + DESPESA
    python -m etl tce                      # empenhos, contratos e licitações (TCE-PR), incremental
    python -m etl tce --tema Despesa --desde 2025
    python -m etl podar                    # apaga o que saiu da janela de gestões
"""

import argparse
import logging
import sys
from datetime import date

from app.db import engine
from app.models import Base
from etl import classificacao, despesa, janela, podar, siconfi, tce
from etl.http import cliente


def desde_na_janela(desde: int | None) -> int:
    inicio = janela.primeiro_exercicio()
    if desde is not None and desde < inicio:
        logging.warning("--desde %d está fora da janela de gestões; usando %d", desde, inicio)
    return max(desde or inicio, inicio)


def coletar_siconfi(args) -> int:
    with cliente() as http:
        falhas = siconfi.executar(http, desde_na_janela(args.desde), args.ate, args.forcar)
    if falhas:
        logging.error("%d coleta(s) falharam", falhas)
    return 1 if falhas else 0


def coletar_tce(args) -> int:
    with engine.begin() as conn:
        classificacao.carregar_funcoes_subfuncoes(conn)  # empenhos referenciam funções/subfunções
    with cliente() as http:
        # padrão: só a gestão atual, pelo volume (~60 MB/ano); a janela de 3 gestões é o teto
        desde = desde_na_janela(args.desde or janela.inicio_gestao_atual())
        falhas = tce.executar(
            http, desde, args.ate, args.tema or list(tce.TEMAS), args.forcar, args.recarregar
        )
    if falhas:
        logging.error("%d coleta(s) falharam", falhas)
    return 1 if falhas else 0


def transformar(_args) -> int:
    refs = siconfi.preparar_referencias()
    with engine.begin() as conn:
        n = classificacao.carregar_funcoes_subfuncoes(conn)
        logging.info("classificação oficial: %d funções/subfunções", n)
        despesa.transformar(conn, refs.fontes)
    return 0


def podar_fora_da_janela(_args) -> int:
    with engine.begin() as conn:
        podar.podar(conn, janela.primeiro_exercicio())
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
