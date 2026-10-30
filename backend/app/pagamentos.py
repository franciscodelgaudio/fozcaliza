"""Regras da Entrega 1 ("Quem recebeu"): o que conta como pagamento e como
cada pagamento é classificado. Mudou a regra, sobe METODOLOGIA_VERSAO.

Pagamento no período = pagamentos menos estornos de pagamento com data no
período (EMPENHO_MOVIMENTO). A categoria vem só da natureza da despesa do
empenho (grupo, modalidade e elemento da Portaria Interministerial 163/2001),
nunca do nome do credor, para valer igual em qualquer ano ou gestão.
"""

METODOLOGIA_VERSAO = 1

# (código, rótulo, explicação). A ordem é a de exibição.
CATEGORIAS = [
    ("fornecedores", "Fornecedores e prestadores de serviço",
     "Compras, serviços e obras pagos diretamente pelo município (modalidade 90), "
     "exceto pessoal, dívida, tributos, sentenças, indenizações e auxílios a pessoas físicas."),
    ("pessoal", "Pessoal e benefícios a servidores",
     "Grupo 1 (pessoal e encargos: salários, aposentadorias, pensões, encargos) e os elementos "
     "08, 14, 46 e 49 (benefícios assistenciais, diárias, auxílio-alimentação e auxílio-transporte)."),
    ("repasses_internos", "Repasses internos (RPPS e entidades do município)",
     "Modalidade 91 (intraorçamentária): dinheiro que sai de um órgão do município para outro, "
     "como a contribuição patronal e os aportes à previdência própria (FOZPREV)."),
    ("transferencias", "Transferências a entidades e governos",
     "Modalidades diferentes de aplicação direta e intraorçamentária: repasses a entidades "
     "sem fins lucrativos (subvenções, contratos de gestão), consórcios e outros governos."),
    ("divida", "Dívida pública",
     "Grupos 2 (juros e encargos) e 6 (amortização) da dívida."),
    ("tributos_sentencas", "Tributos, sentenças judiciais e indenizações",
     "Elementos 47 (obrigações tributárias e contributivas), 91 (sentenças judiciais, inclusive "
     "precatórios) e 93 (indenizações e restituições)."),
    ("auxilios_pf", "Auxílios a pessoas físicas",
     "Elementos 05, 06, 10, 18, 48 e 59: benefícios e auxílios financeiros pagos a pessoas físicas."),
    ("sem_empenho", "Restos a pagar de empenhos anteriores ao detalhamento",
     "Pagamentos de empenhos feitos antes da gestão atual: o TCE-PR informa o pagamento, "
     "mas o empenho (e o credor) está fora do período detalhado."),
]
ROTULO = {c: r for c, r, _ in CATEGORIAS}

APLICACAO_DIRETA = ("90", "93", "94", "95", "96")
ELEMENTOS_PESSOAL = ("08", "14", "46", "49")
ELEMENTOS_TRIBUTOS_SENTENCAS = ("47", "91", "93")
ELEMENTOS_AUXILIOS_PF = ("05", "06", "10", "18", "48", "59")


def _lista(valores: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in valores)


def categoria_sql(empenho: str = "e") -> str:
    """Expressão SQL da categoria a partir de <empenho>.natureza_codigo
    (categoria.grupo.modalidade.elemento.desdobramento.detalhamento)."""
    grupo = f"split_part({empenho}.natureza_codigo, '.', 2)"
    modalidade = f"split_part({empenho}.natureza_codigo, '.', 3)"
    elemento = f"split_part({empenho}.natureza_codigo, '.', 4)"
    return f"""case
        when {empenho}.id is null then 'sem_empenho'
        when {modalidade} = '91' then 'repasses_internos'
        when {modalidade} not in ({_lista(APLICACAO_DIRETA)}) then 'transferencias'
        when {grupo} = '1' or {elemento} in ({_lista(ELEMENTOS_PESSOAL)}) then 'pessoal'
        when {grupo} in ('2', '6') then 'divida'
        when {elemento} in ({_lista(ELEMENTOS_TRIBUTOS_SENTENCAS)}) then 'tributos_sentencas'
        when {elemento} in ({_lista(ELEMENTOS_AUXILIOS_PF)}) then 'auxilios_pf'
        else 'fornecedores'
    end"""
