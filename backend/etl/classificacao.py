"""Tabelas oficiais de classificação (CLASSIFICACAO_OFICIAL).

funcoes_subfuncoes.csv foi gerado a partir do anexo da Portaria MOG 42/1999
consolidada pelo Ministério do Planejamento (atualizada até a Portaria SOF
67/2012, arquivo portariamog42_1999_atualizada_23jul2012.odt em gov.br), mais
a Portaria SOF/MPO 169/2024 (subfunções 241, 242, 245 e 246 a partir de 2025,
conforme Nota SIM-AM 009/2024 do TCE-PR). Inclusões e exclusões feitas por
portarias posteriores valem a partir do exercício seguinte à sua publicação.
A função 99 (Reserva de Contingência) não está na Portaria 42, que delega o
código a cada esfera; o código 99 vem da Portaria Interministerial 163/2001.

Subfunções não pertencem a uma função (podem ser combinadas com qualquer uma),
por isso pai_id fica nulo; a função em que a portaria as lista vai em
atributos.funcao_tipica.
"""

import csv
import re
import unicodedata
from pathlib import Path

from sqlalchemy import Connection, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models import ClassificacaoOficial

ARQUIVO_FUNCOES = Path(__file__).parent / "dados" / "funcoes_subfuncoes.csv"


def carregar_funcoes_subfuncoes(conn: Connection) -> int:
    with ARQUIVO_FUNCOES.open(encoding="utf-8") as f:
        linhas = [
            dict(
                tipo=r["tipo"],
                codigo=r["codigo"],
                descricao=r["descricao"],
                nivel=r["tipo"],
                versao=r["versao"],
                vigencia_inicio=int(r["vigencia_inicio"]),
                vigencia_fim=int(r["vigencia_fim"]) if r["vigencia_fim"] else None,
                atributos={"funcao_tipica": r["funcao_tipica"]} if r["funcao_tipica"] else {},
            )
            for r in csv.DictReader(f)
        ]
    stmt = pg_insert(ClassificacaoOficial).values(linhas)
    conn.execute(stmt.on_conflict_do_update(
        index_elements=["tipo", "codigo", "versao"],
        set_={c: stmt.excluded[c] for c in ("descricao", "nivel", "vigencia_inicio", "vigencia_fim", "atributos")},
    ))
    return len(linhas)


def normalizar(nome: str) -> str:
    """Compara nomes publicados com os da portaria, que variam em acentos,
    hífens e caixa ("Infra-Estrutura Urbana" x "Infraestrutura Urbana")."""
    s = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


class Classificacoes:
    """Índice em memória de CLASSIFICACAO_OFICIAL para um tipo."""

    def __init__(self, conn: Connection, tipo: str):
        c = ClassificacaoOficial.__table__.c
        self.tipo = tipo
        self.linhas = conn.execute(
            select(c.id, c.codigo, c.descricao, c.vigencia_inicio, c.vigencia_fim).where(c.tipo == tipo)
        ).all()

    def _candidatos(self, exercicio: int, filtro) -> list:
        """Versões vigentes no exercício; se não houver, a mais recente de cada
        código. Os relatórios às vezes ainda usam códigos já extintos (ex.: o
        RREO 2015 lista a subfunção 603, excluída em 2012), e o publicado é o fato."""
        achados = [r for r in self.linhas if filtro(r)]
        vigentes = [
            r for r in achados
            if r.vigencia_inicio <= exercicio and (r.vigencia_fim is None or exercicio <= r.vigencia_fim)
        ]
        if vigentes:
            return vigentes
        recentes = {}
        for r in sorted(achados, key=lambda r: r.vigencia_inicio):
            recentes[r.codigo] = r
        return list(recentes.values())

    def por_codigo(self, codigo: str, exercicio: int) -> int:
        achados = self._candidatos(exercicio, lambda r: r.codigo == codigo)
        if len(achados) != 1:
            raise LookupError(f"{self.tipo} {codigo} em {exercicio}: {len(achados)} correspondências")
        return achados[0].id

    def codigo_por_nome(self, nome: str, exercicio: int) -> str:
        alvo = normalizar(nome)
        achados = {r.codigo for r in self._candidatos(exercicio, lambda r: normalizar(r.descricao) == alvo)}
        if len(achados) != 1:
            raise LookupError(f"{self.tipo} '{nome}' em {exercicio}: {len(achados)} correspondências")
        return achados.pop()
