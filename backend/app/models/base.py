from datetime import datetime
from typing import Annotated, Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Computed,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    MetaData,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Nomes estáveis para constraints/índices (necessário para migrações futuras)
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

IntPK = Annotated[int, mapped_column(Identity(), primary_key=True)]
BigIntPK = Annotated[int, mapped_column(BigInteger, Identity(), primary_key=True)]
BigInt = Annotated[int, mapped_column(BigInteger)]
Texto = Annotated[str, mapped_column(Text)]
Jsonb = Annotated[Any, mapped_column(JSONB)]


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map = {
        str: String(),
        datetime: DateTime(timezone=True),
    }


class DadoBruto:
    """Coleta de origem + versionamento. Nada é sobrescrito: ao mudar o valor,
    encerra-se a versão atual (valido_ate = now()) e insere-se uma nova."""

    coleta_id: Mapped[BigInt] = mapped_column(ForeignKey("coleta.id"), sort_order=10)
    valido_de: Mapped[datetime] = mapped_column(server_default=func.now(), sort_order=10)
    valido_ate: Mapped[datetime | None] = mapped_column(sort_order=10)


def check_in(coluna: str, *valores: str) -> CheckConstraint:
    lista = ", ".join(f"'{v}'" for v in valores)
    return CheckConstraint(f"{coluna} IN ({lista})", name=coluna)


def unico_versao_atual(tabela: str, *colunas: str) -> Index:
    """Chave natural da versão vigente (PG15+: NULLs contam como iguais)."""
    return Index(
        f"uq_{tabela}_versao_atual",
        *colunas,
        unique=True,
        postgresql_nulls_not_distinct=True,
        postgresql_where=text("valido_ate IS NULL"),
    )


# FK composta (id, tipo) para CLASSIFICACAO_OFICIAL: a coluna <prefixo>_tipo é
# gerada com valor constante, então o banco garante que funcao_id aponta para
# uma classificação do tipo 'funcao', e assim por diante.
def tipo_classificacao(tipo: str):
    return mapped_column(String, Computed(f"'{tipo}'::varchar", persisted=True))


def fk_classificacao(prefixo: str) -> ForeignKeyConstraint:
    return ForeignKeyConstraint(
        [f"{prefixo}_id", f"{prefixo}_tipo"],
        ["classificacao_oficial.id", "classificacao_oficial.tipo"],
    )
