"""Uso (a partir de backend/):

    python -m etl siconfi                  # coleta incremental, todos os exercícios
    python -m etl siconfi --desde 2024     # só 2024 em diante
    python -m etl siconfi --forcar         # reverifica todos os relatórios (pelo hash)
    python -m etl transformar              # classificações oficiais + DESPESA
"""

import argparse
import logging
import sys
from datetime import date

from app.db import engine
from app.models import Base
from etl import classificacao, despesa, siconfi
from etl.http import cliente


def coletar_siconfi(args) -> int:
    with cliente() as http:
        falhas = siconfi.executar(http, args.desde, args.ate, args.forcar)
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


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m etl")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="comando", required=True)

    p = sub.add_parser("siconfi", help="coleta RREO, RGF, DCA e extrato de entregas do Siconfi")
    p.add_argument("--desde", type=int, default=siconfi.PRIMEIRO_EXERCICIO)
    p.add_argument("--ate", type=int, default=date.today().year)
    p.add_argument("--forcar", action="store_true", help="ignora a janela de reverificação")
    p.set_defaults(executar=coletar_siconfi)

    p = sub.add_parser("transformar", help="gera as tabelas estruturadas a partir dos dados brutos")
    p.set_defaults(executar=transformar)

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
