import json
import logging
import time
from decimal import Decimal
from typing import Any

import httpx

log = logging.getLogger(__name__)

TENTATIVAS = 5
STATUS_TRANSITORIOS = {429, 500, 502, 503, 504}
PAUSA_ENTRE_REQUISICOES = 0.5  # segundos; as APIs públicas são compartilhadas


def cliente() -> httpx.Client:
    return httpx.Client(
        timeout=httpx.Timeout(120, connect=20),
        headers={"User-Agent": "fozcaliza-etl (dados públicos de Foz do Iguaçu)"},
        follow_redirects=True,
    )


def get_json(http: httpx.Client, url: str, params: dict[str, Any]) -> Any:
    """GET com retentativa em falhas transitórias. Números decimais viram
    Decimal (nunca float), para não introduzir erro de arredondamento."""
    for tentativa in range(1, TENTATIVAS + 1):
        try:
            resposta = http.get(url, params=params)
            resposta.raise_for_status()
            time.sleep(PAUSA_ENTRE_REQUISICOES)
            return json.loads(resposta.content, parse_float=Decimal)
        except (httpx.TransportError, httpx.HTTPStatusError) as erro:
            transitorio = (
                isinstance(erro, httpx.TransportError)
                or erro.response.status_code in STATUS_TRANSITORIOS
            )
            if not transitorio or tentativa == TENTATIVAS:
                raise
            espera = 2**tentativa
            log.warning("%s %s: %s; nova tentativa em %ss", url, params, erro, espera)
            time.sleep(espera)
    raise AssertionError("inalcançável")
