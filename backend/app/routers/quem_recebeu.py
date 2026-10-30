"""Entrega 1 — Quem recebeu: pagamentos por credor, com fonte e metodologia.

Regras de pagamento e de categoria em app/pagamentos.py.
"""

from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.pagamentos import CATEGORIAS, METODOLOGIA_VERSAO, ROTULO, categoria_sql

router = APIRouter(prefix="/quem-recebeu", tags=["quem recebeu"])

MUNICIPIO = 4108304
FONTE_NOME = "TCE-PR — Portal Informação para Todos (dados do SIM-AM)"
FONTE_URL = "https://pit.tce.pr.gov.br/Dados/DadosConsulta/Consolidado"
METODOLOGIA_URL = "/metodologia/quem-recebeu"

PAGAMENTOS = f"""
with pagamentos as (
    select m.empenho_id_tce, sum(case when m.tipo = 'pagamento' then m.valor else -m.valor end) as valor
    from empenho_movimento m
    where m.valido_ate is null and m.municipio_ibge = :municipio
      and m.tipo in ('pagamento', 'estorno_pagamento')
      and m.data >= :inicio and m.data < :fim
    group by m.empenho_id_tce
), pg as (
    select p.valor, p.empenho_id_tce, e.id as empenho_id, e.credor_id, e.unidade_gestora_id, e.funcao_id,
           {categoria_sql("e")} as categoria
    from pagamentos p
    left join empenho e on e.id_tce = p.empenho_id_tce and e.valido_ate is null
)
"""


# --- respostas -----------------------------------------------------------------

class Fonte(BaseModel):
    nome: str
    url: str
    coletado_em: datetime | None
    dados_ate: date | None
    metodologia_versao: int
    metodologia_url: str


class Opcao(BaseModel):
    id: int
    nome: str


class Categoria(BaseModel):
    codigo: str
    rotulo: str
    descricao: str


class Filtros(BaseModel):
    anos: list[int]
    unidades: list[Opcao]
    funcoes: list[Opcao]
    categorias: list[Categoria]


class CategoriaValor(Categoria):
    valor: Decimal
    percentual: Decimal | None
    credores: int


class Resumo(BaseModel):
    ano: int
    total: Decimal
    categorias: list[CategoriaValor]
    fonte: Fonte


class CredorRanking(BaseModel):
    credor_id: int | None  # nulo: a entidade não informou o credor
    nome: str
    tipo_documento: str | None
    documento: str | None
    valor: Decimal
    percentual: Decimal | None
    empenhos: int


class Ranking(BaseModel):
    ano: int
    categoria: str
    total_categoria: Decimal
    total_credores: int
    credores: list[CredorRanking]
    fonte: Fonte


class Grupo(BaseModel):
    nome: str
    valor: Decimal


class Contrato(BaseModel):
    numero: str
    ano: int
    objeto: str
    valor: Decimal


class Licitacao(BaseModel):
    modalidade: str
    numero: str
    ano: int
    objeto: str


class EmpenhoPago(BaseModel):
    id_tce: int
    numero: int
    ano: int
    data: date
    orgao: str
    funcao: str
    categoria: str
    natureza: str
    historico: str | None
    valor_empenhado: Decimal
    pago_no_ano: Decimal
    contratos: list[Contrato]
    licitacoes: list[Licitacao]


class CredorDetalhe(BaseModel):
    ano: int
    credor_id: int
    nome: str
    tipo_documento: str
    documento: str
    total: Decimal
    por_categoria: list[Grupo]
    por_orgao: list[Grupo]
    por_funcao: list[Grupo]
    total_empenhos: int
    empenhos: list[EmpenhoPago]  # os de maior pagamento no ano, até `limite`
    fonte: Fonte


# --- auxiliares ------------------------------------------------------------------

def formatar_documento(tipo: str | None, documento: str | None) -> str | None:
    if tipo == "CNPJ" and documento and len(documento) == 14 and documento.isdigit():
        d = documento
        return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
    return documento  # CPF já vem mascarado da fonte e é mantido assim


def parametros(ano: int) -> dict:
    return {"municipio": MUNICIPIO, "inicio": date(ano, 1, 1), "fim": date(ano + 1, 1, 1)}


def filtros_sql(unidade_gestora_id: int | None, funcao_id: int | None, params: dict) -> str:
    condicoes = []
    if unidade_gestora_id is not None:
        condicoes.append("pg.unidade_gestora_id = :unidade_gestora_id")
        params["unidade_gestora_id"] = unidade_gestora_id
    if funcao_id is not None:
        condicoes.append("pg.funcao_id = :funcao_id")
        params["funcao_id"] = funcao_id
    return (" and " + " and ".join(condicoes)) if condicoes else ""


def fonte(db: Session) -> Fonte:
    r = db.execute(text("""
        select (select max(c.executada_em) from coleta c join fonte f on f.id = c.fonte_id
                where f.dataset = 'PIT Despesa' and c.status = 'sucesso') as coletado_em,
               (select max(data) from empenho_movimento
                where valido_ate is null and tipo = 'pagamento' and municipio_ibge = :municipio) as dados_ate
    """), {"municipio": MUNICIPIO}).one()
    return Fonte(
        nome=FONTE_NOME, url=FONTE_URL, coletado_em=r.coletado_em, dados_ate=r.dados_ate,
        metodologia_versao=METODOLOGIA_VERSAO, metodologia_url=METODOLOGIA_URL,
    )


def percentual(valor: Decimal, total: Decimal) -> Decimal | None:
    return (valor / total * 100).quantize(Decimal("0.01")) if total else None


# --- rotas ---------------------------------------------------------------------------

@router.get("/filtros", response_model=Filtros)
def filtros(db: Session = Depends(get_db)):
    anos = db.execute(text("""
        select distinct extract(year from m.data)::int as ano
        from empenho_movimento m join empenho e on e.id_tce = m.empenho_id_tce and e.valido_ate is null
        where m.valido_ate is null and m.tipo = 'pagamento' and m.municipio_ibge = :municipio
        order by 1 desc
    """), {"municipio": MUNICIPIO}).scalars().all()
    unidades = db.execute(text("""
        select u.id, u.nome from unidade_gestora u
        where u.id in (select distinct unidade_gestora_id from empenho where valido_ate is null)
        order by u.nome
    """)).all()
    funcoes = db.execute(text("""
        select c.id, c.codigo || ' - ' || c.descricao as nome from classificacao_oficial c
        where c.id in (select distinct funcao_id from empenho where valido_ate is null)
        order by c.codigo
    """)).all()
    return Filtros(
        anos=anos,
        unidades=[Opcao(id=u.id, nome=u.nome) for u in unidades],
        funcoes=[Opcao(id=f.id, nome=f.nome) for f in funcoes],
        categorias=[Categoria(codigo=c, rotulo=r, descricao=d) for c, r, d in CATEGORIAS],
    )


@router.get("/resumo", response_model=Resumo)
def resumo(
    ano: int,
    unidade_gestora_id: int | None = None,
    funcao_id: int | None = None,
    db: Session = Depends(get_db),
):
    params = parametros(ano)
    onde = filtros_sql(unidade_gestora_id, funcao_id, params)
    linhas = {r.categoria: r for r in db.execute(text(PAGAMENTOS + f"""
        select pg.categoria, sum(pg.valor) as valor, count(distinct pg.credor_id) as credores
        from pg where true {onde} group by pg.categoria
    """), params)}
    total = sum((r.valor for r in linhas.values()), Decimal(0))
    categorias = [
        CategoriaValor(
            codigo=c, rotulo=r, descricao=d,
            valor=linhas[c].valor if c in linhas else Decimal(0),
            percentual=percentual(linhas[c].valor, total) if c in linhas else Decimal(0),
            credores=linhas[c].credores if c in linhas else 0,
        )
        for c, r, d in CATEGORIAS
        # com filtro de órgão ou função, pagamentos sem empenho não têm como entrar
        if not (c == "sem_empenho" and onde)
    ]
    return Resumo(ano=ano, total=total, categorias=categorias, fonte=fonte(db))


@router.get("/credores", response_model=Ranking)
def credores(
    ano: int,
    categoria: str = "fornecedores",
    unidade_gestora_id: int | None = None,
    funcao_id: int | None = None,
    busca: str | None = Query(None, description="parte do nome ou do documento"),
    limite: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    if categoria not in ROTULO:
        raise HTTPException(422, f"categoria desconhecida: {categoria}")
    params = parametros(ano) | {"categoria": categoria, "limite": limite, "offset": offset}
    onde = filtros_sql(unidade_gestora_id, funcao_id, params)
    total_categoria = db.execute(text(PAGAMENTOS + f"""
        select coalesce(sum(pg.valor), 0) from pg where pg.categoria = :categoria {onde}
    """), params).scalar()
    busca_sql = ""
    if busca:
        busca_sql = " and (c.nome ilike :busca or c.documento like :busca_doc)"
        params["busca"] = f"%{busca}%"
        params["busca_doc"] = f"%{''.join(ch for ch in busca if ch.isdigit()) or busca}%"
    linhas = db.execute(text(PAGAMENTOS + f"""
        , ranking as (
            select pg.credor_id, sum(pg.valor) as valor, count(distinct pg.empenho_id_tce) as empenhos
            from pg where pg.categoria = :categoria {onde} group by pg.credor_id
        )
        select r.*, c.nome, c.tipo_documento, c.documento, count(*) over () as total_credores
        from ranking r left join credor c on c.id = r.credor_id
        where r.valor <> 0 {busca_sql}
        order by r.valor desc, c.nome
        limit :limite offset :offset
    """), params).all()
    return Ranking(
        ano=ano,
        categoria=categoria,
        total_categoria=total_categoria,
        total_credores=linhas[0].total_credores if linhas else 0,
        credores=[
            CredorRanking(
                credor_id=r.credor_id,
                nome=r.nome or "Credor não informado pela entidade",
                tipo_documento=r.tipo_documento,
                documento=formatar_documento(r.tipo_documento, r.documento),
                valor=r.valor,
                percentual=percentual(r.valor, total_categoria),
                empenhos=r.empenhos,
            )
            for r in linhas
        ],
        fonte=fonte(db),
    )


@router.get("/credores/{credor_id}", response_model=CredorDetalhe)
def credor(
    credor_id: int,
    ano: int,
    limite: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    c = db.execute(text("select id, nome, tipo_documento, documento from credor where id = :id"),
                   {"id": credor_id}).one_or_none()
    if c is None:
        raise HTTPException(404, "credor não encontrado")
    params = parametros(ano) | {"credor_id": credor_id, "limite": limite}

    def agrupar(coluna_nome: str, junta: str) -> list[Grupo]:
        return [
            Grupo(nome=r.nome, valor=r.valor)
            for r in db.execute(text(PAGAMENTOS + f"""
                select {coluna_nome} as nome, sum(pg.valor) as valor
                from pg {junta} where pg.credor_id = :credor_id
                group by 1 having sum(pg.valor) <> 0 order by 2 desc
            """), params)
        ]

    por_categoria = [
        Grupo(nome=ROTULO[g.nome], valor=g.valor) for g in agrupar("pg.categoria", "")
    ]
    por_orgao = agrupar("u.nome", "join unidade_gestora u on u.id = pg.unidade_gestora_id")
    por_funcao = agrupar("f.codigo || ' - ' || f.descricao", "join classificacao_oficial f on f.id = pg.funcao_id")

    empenhos = db.execute(text(PAGAMENTOS + """
        select e.id_tce, e.numero, e.ano, e.data, e.orgao_nome as orgao,
               f.codigo || ' - ' || f.descricao as funcao, pg.categoria,
               e.natureza_codigo || ' - ' || e.natureza_descricao as natureza,
               e.historico, e.valor as valor_empenhado, pg.valor as pago_no_ano,
               count(*) over () as total_empenhos,
               coalesce((
                   select json_agg(json_build_object('numero', ct.numero, 'ano', ct.ano_contrato,
                                                     'objeto', ct.objeto, 'valor', ct.valor))
                   from vinculo v join contrato ct on ct.id_tce = v.destino_id_tce and ct.valido_ate is null
                   where v.valido_ate is null and v.tipo = 'empenho_contrato' and v.origem_id_tce = e.id_tce
               ), '[]') as contratos,
               coalesce((
                   select json_agg(json_build_object('modalidade', l.modalidade, 'numero', l.numero,
                                                     'ano', l.ano_licitacao, 'objeto', l.objeto))
                   from vinculo v join licitacao l on l.id_tce = v.destino_id_tce and l.valido_ate is null
                   where v.valido_ate is null and v.tipo = 'empenho_licitacao' and v.origem_id_tce = e.id_tce
               ), '[]') as licitacoes
        from pg
        join empenho e on e.id = pg.empenho_id
        join classificacao_oficial f on f.id = e.funcao_id
        where pg.credor_id = :credor_id and pg.valor <> 0
        order by pg.valor desc
        limit :limite
    """), params).all()

    return CredorDetalhe(
        ano=ano,
        credor_id=c.id,
        nome=c.nome,
        tipo_documento=c.tipo_documento,
        documento=formatar_documento(c.tipo_documento, c.documento),
        total=sum((g.valor for g in por_categoria), Decimal(0)),
        por_categoria=por_categoria,
        por_orgao=por_orgao,
        por_funcao=por_funcao,
        total_empenhos=empenhos[0].total_empenhos if empenhos else 0,
        empenhos=[
            EmpenhoPago(
                id_tce=e.id_tce, numero=e.numero, ano=e.ano, data=e.data, orgao=e.orgao,
                funcao=e.funcao, categoria=ROTULO[e.categoria], natureza=e.natureza,
                historico=e.historico, valor_empenhado=e.valor_empenhado, pago_no_ano=e.pago_no_ano,
                contratos=e.contratos, licitacoes=e.licitacoes,
            )
            for e in empenhos
        ],
        fonte=fonte(db),
    )
