// Como cada tema do "Download de Dados" do TCE-PR é mostrado: arquivo principal,
// colunas da tabela, campos de busca e registros relacionados.

import { agrupar, numero, registros, type Registro } from "./dados";

export type Tipo = "texto" | "moeda" | "data" | "numero" | "doc" | "longo";
export type Coluna = { campo: string; rotulo: string; tipo?: Tipo };

/** Registros de outro XML ligados ao registro aberto por um campo em comum. */
export type Relacionado = {
  titulo: string;
  arquivo: string;
  /** Campo no arquivo relacionado (a fonte varia a grafia: idcontrato / idContrato). */
  campos: string[];
  /** Campo no registro principal; padrão: o id do tema. */
  local?: string;
  colunas: Coluna[];
};

/** Ligação a outro tema por uma tabela de relacionamento (ex.: EmpenhoXContrato). */
export type Vinculo = { titulo: string; ponte: string; de: string; para: string; tema: string };

export type Tema = {
  slug: string;
  nome: string;
  /** Nome do zip no TCE (chave de fonte.json). */
  zip: string;
  /** XML principal do tema. */
  arquivo: string;
  id?: string;
  descricao: string;
  titulo: (r: Registro) => string;
  colunas: Coluna[];
  busca: string[];
  /** Campo somado no resumo e usado para ordenar por valor. */
  valor?: { campo: string; rotulo: string; tipo: Tipo };
  data?: string;
  relacionados?: Relacionado[];
  vinculos?: Vinculo[];
};

const ENTIDADE: Coluna = { campo: "nmEntidade", rotulo: "Entidade" };

export const TEMAS: Tema[] = [
  {
    slug: "despesas",
    nome: "Despesas",
    zip: "Despesa",
    arquivo: "Empenho",
    id: "idEmpenho",
    descricao: "Empenhos com credor, classificação e valores; liquidações e pagamentos datados.",
    titulo: (r) => `Empenho ${r.nrEmpenho}/${r.nrAnoEmpenho} — ${r.nmCredor || "credor não informado"}`,
    colunas: [
      ENTIDADE,
      { campo: "nrEmpenho", rotulo: "Nº" },
      { campo: "dtEmpenho", rotulo: "Data", tipo: "data" },
      { campo: "nmCredor", rotulo: "Credor" },
      { campo: "nrDocCredor", rotulo: "Documento", tipo: "doc" },
      { campo: "dsFuncao", rotulo: "Função" },
      { campo: "dsHistorico", rotulo: "Histórico", tipo: "longo" },
      { campo: "vlEmpenho", rotulo: "Empenhado", tipo: "moeda" },
      { campo: "calc_pago", rotulo: "Pago (movimentos)", tipo: "moeda" },
    ],
    busca: ["nmCredor", "nrDocCredor", "dsHistorico", "dsFuncao", "nmUnidade", "nrEmpenho", "dsDesdobramento"],
    valor: { campo: "vlEmpenho", rotulo: "Empenhado", tipo: "moeda" },
    data: "dtEmpenho",
    relacionados: [
      {
        titulo: "Liquidações",
        arquivo: "EmpenhoLiquidacao",
        campos: ["idEmpenho"],
        colunas: [
          { campo: "nrLiquidacao", rotulo: "Nº" },
          { campo: "dtLiquidacao", rotulo: "Data", tipo: "data" },
          { campo: "nmLiquidante", rotulo: "Liquidante" },
          { campo: "vlLiquidacaoBruto", rotulo: "Bruto", tipo: "moeda" },
          { campo: "vlLiquidacaoEstornado", rotulo: "Estornado", tipo: "moeda" },
          { campo: "vlLiquidacaoLiquido", rotulo: "Líquido", tipo: "moeda" },
        ],
      },
      {
        titulo: "Estornos de liquidação",
        arquivo: "EmpenhoLiquidacaoEstorno",
        campos: ["idEmpenho"],
        colunas: [
          { campo: "nrEstorno", rotulo: "Nº" },
          { campo: "dtEstorno", rotulo: "Data", tipo: "data" },
          { campo: "vlEstorno", rotulo: "Valor", tipo: "moeda" },
        ],
      },
      {
        titulo: "Pagamentos",
        arquivo: "EmpenhoPagamento",
        campos: ["idEmpenho"],
        // Na fonte, os últimos atributos de EmpenhoPagamento vêm com nomes
        // deslocados (vlPagamentoBruto traz "BANCO"); só estes são confiáveis.
        colunas: [
          { campo: "nrPagamento", rotulo: "Nº" },
          { campo: "dtOperacao", rotulo: "Data", tipo: "data" },
          { campo: "nmResponsavel", rotulo: "Responsável" },
          { campo: "vlOperacao", rotulo: "Valor", tipo: "moeda" },
        ],
      },
      {
        titulo: "Estornos de pagamento",
        arquivo: "EmpenhoPagamentoEstorno",
        campos: ["idEmpenho"],
        colunas: [
          { campo: "nrEstorno", rotulo: "Nº" },
          { campo: "dtEstorno", rotulo: "Data", tipo: "data" },
          { campo: "vlEstorno", rotulo: "Valor", tipo: "moeda" },
        ],
      },
    ],
    vinculos: [
      { titulo: "Contratos", ponte: "EmpenhoXContrato", de: "idEmpenho", para: "idContrato", tema: "contratos" },
      { titulo: "Licitações", ponte: "LicitacaoXEmpenho", de: "idEmpenho", para: "idLicitacao", tema: "licitacoes" },
    ],
  },
  {
    slug: "licitacoes",
    nome: "Licitações",
    zip: "Licitacao",
    arquivo: "Licitacao",
    id: "idLicitacao",
    descricao: "Licitações com modalidade, objeto, situação, participantes e vencedores por item.",
    titulo: (r) => `${r.dsModalidadeLicitacao} ${r.nrLicitacao}/${r.nrAnoLicitacao}`,
    colunas: [
      ENTIDADE,
      { campo: "dsModalidadeLicitacao", rotulo: "Modalidade" },
      { campo: "nrLicitacao", rotulo: "Nº" },
      { campo: "dtAbertura", rotulo: "Abertura", tipo: "data" },
      { campo: "dsObjeto", rotulo: "Objeto", tipo: "longo" },
      { campo: "dsTipoSituacaoLicitacao", rotulo: "Situação" },
      { campo: "vlLicitacao", rotulo: "Valor estimado", tipo: "moeda" },
    ],
    busca: ["dsObjeto", "dsModalidadeLicitacao", "nrLicitacao", "dsTipoSituacaoLicitacao", "dsNaturezaLicitacao"],
    valor: { campo: "vlLicitacao", rotulo: "Valor estimado", tipo: "moeda" },
    data: "dtAbertura",
    relacionados: [
      {
        titulo: "Participantes",
        arquivo: "LicitacaoParticipante",
        campos: ["idLicitacao"],
        colunas: [
          { campo: "nmParticipanteLicitacao", rotulo: "Participante" },
          { campo: "nrDocParticipanteLicitacao", rotulo: "Documento", tipo: "doc" },
          { campo: "dsTipoSituacaoParticipante", rotulo: "Situação" },
        ],
      },
      {
        titulo: "Vencedores por item",
        arquivo: "LicitacaoVencedor",
        campos: ["idlicitacao", "idLicitacao"],
        colunas: [
          { campo: "nrLote", rotulo: "Lote" },
          { campo: "nrItem", rotulo: "Item" },
          { campo: "dsItem", rotulo: "Descrição", tipo: "longo" },
          { campo: "nmPessoa", rotulo: "Vencedor" },
          { campo: "nrQuantidadeVencedorLicitacao", rotulo: "Qtd.", tipo: "numero" },
          { campo: "vlMaximoUnitarioitem", rotulo: "Máx. unit.", tipo: "moeda" },
          { campo: "vlLicitacaoVencedorLicitacao", rotulo: "Vencedor unit.", tipo: "moeda" },
        ],
      },
    ],
    vinculos: [
      { titulo: "Contratos", ponte: "LicitacaoXContrato", de: "idLicitacao", para: "idContrato", tema: "contratos" },
      { titulo: "Empenhos", ponte: "LicitacaoXEmpenho", de: "idLicitacao", para: "idEmpenho", tema: "despesas" },
    ],
  },
  {
    slug: "contratos",
    nome: "Contratos",
    zip: "Contrato",
    arquivo: "Contrato",
    id: "idContrato",
    descricao: "Contratos com contratado, objeto, vigência e aditivos de valor, prazo e rescisão.",
    titulo: (r) => `Contrato ${r.nrContrato}/${r.nrAnoContrato} — ${r.nmContratado}`,
    colunas: [
      ENTIDADE,
      { campo: "nrContrato", rotulo: "Nº" },
      { campo: "nmContratado", rotulo: "Contratado" },
      { campo: "nrDocContratado", rotulo: "Documento", tipo: "doc" },
      { campo: "dsObjeto", rotulo: "Objeto", tipo: "longo" },
      { campo: "dtAssinatura", rotulo: "Assinatura", tipo: "data" },
      { campo: "dtFim", rotulo: "Fim", tipo: "data" },
      { campo: "vlContrato", rotulo: "Valor", tipo: "moeda" },
    ],
    busca: ["nmContratado", "nrDocContratado", "dsObjeto", "nrContrato"],
    valor: { campo: "vlContrato", rotulo: "Valor contratado", tipo: "moeda" },
    data: "dtAssinatura",
    relacionados: [
      {
        titulo: "Aditivos",
        arquivo: "ContratoAditivo",
        campos: ["idcontrato", "idContrato"],
        colunas: [
          { campo: "nrAditivoContrato", rotulo: "Nº" },
          { campo: "dtAditivoContrato", rotulo: "Data", tipo: "data" },
          { campo: "dsTipoAditivoContrato", rotulo: "Tipo" },
          { campo: "dsTipoOperacaoAditivoContrato", rotulo: "Operação" },
          { campo: "vlAditivo", rotulo: "Valor", tipo: "moeda" },
          { campo: "vlAtualizadoContrato", rotulo: "Contrato atualizado", tipo: "moeda" },
        ],
      },
      {
        titulo: "Aditivos de prazo",
        arquivo: "ContratoAditivoPrazo",
        campos: ["idcontrato", "idContrato"],
        colunas: [
          { campo: "nrAditivoContrato", rotulo: "Nº" },
          { campo: "dtAditivoContrato", rotulo: "Data", tipo: "data" },
          { campo: "dtFim", rotulo: "Novo fim", tipo: "data" },
          { campo: "dsMotivoAditivoPrazoContrato", rotulo: "Motivo", tipo: "longo" },
        ],
      },
      {
        titulo: "Rescisões",
        arquivo: "ContratoAditivoRescisao",
        campos: ["idContrato", "idcontrato"],
        colunas: [
          { campo: "dtAditivoContrato", rotulo: "Data", tipo: "data" },
          { campo: "dsTipoMotivoRescisaoContrato", rotulo: "Motivo" },
          { campo: "dsMotivoAditivoRescisaoContrato", rotulo: "Justificativa", tipo: "longo" },
        ],
      },
    ],
    vinculos: [
      { titulo: "Licitações", ponte: "LicitacaoXContrato", de: "idContrato", para: "idLicitacao", tema: "licitacoes" },
      { titulo: "Empenhos", ponte: "EmpenhoXContrato", de: "idContrato", para: "idEmpenho", tema: "despesas" },
    ],
  },
  {
    slug: "obras",
    nome: "Obras",
    zip: "Obra",
    arquivo: "Intervencao",
    id: "idIntervencao",
    descricao: "Obras e intervenções com valor, prazo, situação e local.",
    titulo: (r) => r.nmIntervencao,
    colunas: [
      ENTIDADE,
      { campo: "nmIntervencao", rotulo: "Obra", tipo: "longo" },
      { campo: "dsSituacao", rotulo: "Situação" },
      { campo: "dtInicio", rotulo: "Início", tipo: "data" },
      { campo: "nrPrazoExecucao", rotulo: "Prazo (dias)", tipo: "numero" },
      { campo: "dtUltimaMedicao", rotulo: "Última medição", tipo: "data" },
      { campo: "vlIntervencao", rotulo: "Valor", tipo: "moeda" },
    ],
    busca: ["nmIntervencao", "dsSituacao"],
    valor: { campo: "vlIntervencao", rotulo: "Valor das obras", tipo: "moeda" },
    data: "dtInicio",
    relacionados: [
      {
        titulo: "Locais",
        arquivo: "IntervencaoBem",
        campos: ["idIntervencao"],
        colunas: [
          { campo: "dsBem", rotulo: "Bem", tipo: "longo" },
          { campo: "nmLogradouro", rotulo: "Endereço", tipo: "longo" },
          { campo: "dsCoordenadaGeografica", rotulo: "Coordenadas" },
        ],
      },
    ],
  },
  {
    slug: "convenios",
    nome: "Convênios",
    zip: "Convenio",
    arquivo: "Convenio",
    id: "idConvenio",
    descricao: "Convênios firmados pelas entidades do município.",
    titulo: (r) => r.dsObjeto || r.idConvenio || "Convênio",
    colunas: [ENTIDADE],
    busca: ["dsObjeto", "nmEntidade"],
  },
  {
    slug: "combustiveis",
    nome: "Combustíveis",
    zip: "Combustivel",
    arquivo: "Combustivel",
    descricao: "Consumo mensal de combustível por veículo ou equipamento.",
    titulo: (r) => `${r.nrPlaca || r.cdBem} — ${r.dsVeiculoEquipamento} (${r.nrMes}/${r.nrAno})`,
    colunas: [
      ENTIDADE,
      { campo: "nrMes", rotulo: "Mês", tipo: "numero" },
      { campo: "nrPlaca", rotulo: "Placa" },
      { campo: "dsVeiculoEquipamento", rotulo: "Veículo/equipamento" },
      { campo: "dsTiposObjetoDespesa", rotulo: "Combustível" },
      { campo: "vlConsumo", rotulo: "Consumo", tipo: "numero" },
      { campo: "vlMedicao", rotulo: "Medição", tipo: "numero" },
      { campo: "dsTipoMedidor", rotulo: "Medidor" },
    ],
    busca: ["nrPlaca", "dsVeiculoEquipamento", "dsModeloFIPE", "dsMarcaVeiculo", "dsTiposObjetoDespesa"],
    valor: { campo: "vlConsumo", rotulo: "Consumo (litros/m³)", tipo: "numero" },
  },
  {
    slug: "diarias",
    nome: "Diárias",
    zip: "Diarias",
    arquivo: "Diarias",
    descricao: "Diárias de viagem: quem recebeu, destino, período, objetivo e valor.",
    titulo: (r) => `${r.nmCredor} — ${r.MunicipioDestinoViagem}`,
    colunas: [
      ENTIDADE,
      { campo: "nmCredor", rotulo: "Beneficiário" },
      { campo: "MunicipioDestinoViagem", rotulo: "Destino" },
      { campo: "dtInicio", rotulo: "Início", tipo: "data" },
      { campo: "dtFim", rotulo: "Fim", tipo: "data" },
      { campo: "nrDiaria", rotulo: "Diárias", tipo: "numero" },
      { campo: "dsObjetivo", rotulo: "Objetivo", tipo: "longo" },
      { campo: "vlTotalDiaria", rotulo: "Valor", tipo: "moeda" },
    ],
    busca: ["nmCredor", "MunicipioDestinoViagem", "dsObjetivo"],
    valor: { campo: "vlTotalDiaria", rotulo: "Total em diárias", tipo: "moeda" },
    data: "dtInicio",
  },
];

export const tema = (slug: string) => TEMAS.find((t) => t.slug === slug);

/** Linhas do tema; sem id na fonte, a posição no arquivo identifica o registro. */
export async function linhas(ano: number, t: Tema): Promise<Registro[]> {
  const rs = await registros(ano, t.arquivo);
  if (t.slug === "despesas") await calcularPagos(ano, rs);
  return rs;
}

export const idDe = (t: Tema, r: Registro, posicao: number) => (t.id && r[t.id]) || `n${posicao}`;

const calculados = new WeakSet<Registro[]>();

/**
 * Pago por empenho a partir dos movimentos datados (pagamentos − estornos).
 * Fica ao lado do vlPagamento publicado no próprio Empenho, que nem sempre bate.
 */
async function calcularPagos(ano: number, empenhos: Registro[]) {
  if (calculados.has(empenhos)) return;
  const [pag, est] = await Promise.all([registros(ano, "EmpenhoPagamento"), registros(ano, "EmpenhoPagamentoEstorno")]);
  const pago = new Map<string, number>();
  for (const p of pag) pago.set(p.idEmpenho, (pago.get(p.idEmpenho) ?? 0) + numero(p.vlOperacao));
  for (const e of est) pago.set(e.idEmpenho, (pago.get(e.idEmpenho) ?? 0) - numero(e.vlEstorno));
  for (const e of empenhos) e.calc_pago = (pago.get(e.idEmpenho) ?? 0).toFixed(2);
  calculados.add(empenhos);
}

/** Índice id → registro para um tema (usado nos vínculos). */
const indices = new Map<string, Map<string, Registro>>();
export async function porId(ano: number, t: Tema): Promise<Map<string, Registro>> {
  const chave = `${ano}/${t.slug}`;
  let m = indices.get(chave);
  if (!m) {
    const rs = await linhas(ano, t);
    m = new Map(rs.map((r, i) => [idDe(t, r, i), r]));
    indices.set(chave, m);
  }
  return m;
}

/** Índice campo → registros de um XML (usado nos relacionados e pontes). */
const grupos = new Map<string, Map<string, Registro[]>>();
export async function agrupado(ano: number, arquivo: string, campo: string) {
  const chave = `${ano}/${arquivo}/${campo}`;
  let m = grupos.get(chave);
  if (!m) {
    m = agrupar(await registros(ano, arquivo), campo);
    grupos.set(chave, m);
  }
  return m;
}
