// Modelo de licitação montado a partir dos XML do TCE-PR (sem banco).
// Junta Licitacao + LicitacaoParticipante + LicitacaoVencedor + LicitacaoXContrato
// + Contrato e a origem do fornecedor (Receita). Calculado uma vez por processo.
//
// Decisões documentadas em docs/licitacoes/inspecao-dados.md:
// - Valor de um item vencido: `vlLicitacaoVencedorLicitacao` às vezes é unitário,
//   às vezes total. Se quantidade × valor passar de 1,5 × o valor máximo total do
//   item, o valor publicado é tratado como total (e o item fica marcado).
// - Item com mais de um vencedor (credenciamento): o valor entra uma vez só e é
//   dividido igualmente entre os vencedores, marcado como dividido.
// - "Valor homologado" da licitação = soma dos itens vencidos. É o valor usado para
//   saber para onde foi o dinheiro. Atas de registro de preço não somam como gasto.

import { agrupar, anos, numero, registros, type Registro } from "@/lib/tce/dados";
import { baseCnpj, fornecedor, type BaseCnpj, type Fornecedor } from "./fornecedores";
import { gestaoDe } from "./gestao";
import { casadorPncp, type CasamentoPncp } from "./pncp";

/** Folga sobre o valor máximo antes de considerar que o valor publicado já é o total do item. */
const FOLGA_VALOR_TOTAL = 1.5;

export type Entidade = { id: string; slug: string; nome: string; curto: string; principal: boolean };

/** Nome curto de cada entidade, para listas e filtros. */
export const NOMES_CURTOS: Record<string, string> = {
  "12294": "Prefeitura",
  "933995": "Fundação Municipal de Saúde",
  "10891": "Fundação Cultural",
  "9808": "Câmara Municipal",
  "205311": "FozPrev",
  "103577": "FozHabita",
  "15025": "Foztrans",
};

/**
 * Secretaria que executa a despesa da licitação, tirada dos empenhos ligados a ela
 * (direto por LicitacaoXEmpenho ou via contrato → EmpenhoXContrato). Quando há mais de
 * um órgão, fica o de maior valor empenhado e a contagem dos demais.
 * Sem vínculo publicado, fica null ("Secretaria não informada") — nunca é estimada.
 */
export type Secretaria = { nome: string; outras: number; via: "empenho" | "contrato" };

/** A prefeitura (administração direta). As demais entidades ficam disponíveis como filtro. */
export const ID_PREFEITURA = "12294";

const SLUGS: Record<string, string> = {
  "12294": "prefeitura",
  "933995": "saude",
  "10891": "cultura",
  "9808": "camara",
  "205311": "fozprev",
  "103577": "fozhabita",
  "15025": "foztrans",
};

const MODALIDADES: Record<string, string> = {
  "Processo Inexigibilidade": "Inexigibilidade",
  "Processo Dispensa": "Dispensa",
  "Pregão - Eletrônico": "Pregão eletrônico",
  "Pregão": "Pregão",
  "Concorrência - Eletrônica": "Concorrência eletrônica",
  "Concorrência": "Concorrência",
};

/** Modalidades em que se espera disputa entre empresas (usadas no sinal 1). */
export const MODALIDADES_COMPETITIVAS = new Set(["Pregão eletrônico", "Pregão", "Concorrência eletrônica", "Concorrência"]);

export type TipoObjeto = "bens-servicos" | "obras" | "ti" | "locacao" | "outro";

export type ItemVencido = {
  lote: string;
  item: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  precoMaximoUnitario: number;
  valorMaximo: number;
  /** Valor do item que coube a este vencedor. */
  valor: number;
  vencedor: string;
  /** O valor publicado parecia já ser o total do item (não o unitário). */
  valorPublicadoComoTotal: boolean;
  /** Item com vários vencedores; o valor foi dividido igualmente entre eles. */
  divididoEntre: number;
};

export type ContratoResumo = {
  id: string;
  numero: string;
  ato: string;
  doc: string;
  contratado: string;
  valor: number;
  assinatura: string;
  inicio: string;
  fim: string;
};

export type Vencedor = Fornecedor & { valor: number; itens: number };

export type Licitacao = {
  id: string;
  ano: number;
  entidade: Entidade;
  secretaria: Secretaria | null;
  modalidade: string;
  modalidadeOriginal: string;
  numero: string;
  /** Número do processo administrativo de origem ("84400/2025"), quando informado. Chave para o PNCP. */
  processo: string | null;
  objeto: string;
  tipoObjeto: TipoObjeto;
  criterio: string | null;
  situacao: string;
  dataEdital: string | null;
  dataAbertura: string | null;
  dataHomologacao: string | null;
  gestao: string | null;
  valorEstimado: number;
  /** Soma dos itens vencidos; null se o TCE-PR não publicou vencedor. */
  valorHomologado: number | null;
  /** Valor máximo (estimado) só dos itens que tiveram vencedor: base do desconto. */
  valorEstimadoItensVencidos: number | null;
  vencedores: Vencedor[];
  /** CNPJs/CPFs distintos que participaram; null quando o TCE-PR não publicou participantes. */
  participantes: number | null;
  itens: ItemVencido[];
  contratos: ContratoResumo[];
  /** Compra correspondente no PNCP (pelo número do processo), ou por que não foi achada. */
  pncp: CasamentoPncp;
  /** Referência no TCE-PR, para citar a fonte. */
  fonte: { arquivo: string; dataReferencia: string; ultimoEnvio: string };
};

/** CNPJ/CPF só com dígitos; documento mascarado ("***.531.***-**") fica como publicado. */
const chaveDoc = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t.includes("*") ? t : t.replace(/\D/g, "");
};

const data = (v: string | undefined) => (v ? v.slice(0, 10) : null);

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o"]);

/** "SECRETARIA MUNICIPAL DA SAÚDE" → "Secretaria Municipal da Saúde". */
export function capitalizar(nome: string): string {
  return nome
    .trim()
    .replace(/\.$/, "")
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) =>
      i > 0 && MINUSCULAS.has(p) ? p : /^(i{1,3}|iv|vi{0,3}|ix|xi{0,3})$/.test(p) ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1),
    )
    .join(" ");
}

function secretariaDe(empenhos: Registro[], via: Secretaria["via"]): Secretaria | null {
  if (!empenhos.length) return null;
  const valor = new Map<string, number>();
  for (const e of empenhos) if (e.nmOrgao) valor.set(e.nmOrgao, (valor.get(e.nmOrgao) ?? 0) + numero(e.vlEmpenho));
  if (!valor.size) return null;
  const ordem = [...valor].sort((a, b) => b[1] - a[1]);
  return { nome: capitalizar(ordem[0][0]), outras: ordem.length - 1, via };
}

function tipoObjeto(ds: string): TipoObjeto {
  if (/^Obras/i.test(ds)) return "obras";
  if (/^Compras/i.test(ds)) return "bens-servicos";
  if (/tecnologia/i.test(ds)) return "ti";
  if (/Loca/i.test(ds)) return "locacao";
  return "outro";
}

function slugEntidade(id: string, nome: string): string {
  if (SLUGS[id]) return SLUGS[id];
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ de foz do iguacu/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Valor total de uma linha de LicitacaoVencedor e se o valor publicado já era o total. */
function totalDoItem(r: Registro): { total: number; comoTotal: boolean } {
  const q = numero(r.nrQuantidadeVencedorLicitacao) || numero(r.nrQuantidade);
  const v = numero(r.vlLicitacaoVencedorLicitacao) || numero(r.vlPropostaItem);
  const maximo = numero(r.vlMaximoTotal);
  if (q <= 1 || maximo <= 0 || q * v <= maximo * FOLGA_VALOR_TOTAL + 0.01) return { total: q > 0 ? q * v : v, comoTotal: false };
  return { total: v, comoTotal: true };
}

function montarItens(linhas: Registro[], cache: BaseCnpj) {
  // Remove linhas repetidas (mesmo item, mesmo vencedor).
  const vistos = new Set<string>();
  const unicas = linhas.filter((r) => {
    const k = `${r.nrLote}|${r.nrItem}|${r.nrDocumento}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  const porItem = agrupar(
    unicas.map((r) => ({ ...r, chaveItem: `${r.nrLote}|${r.nrItem}` })),
    "chaveItem",
  );
  const itens: ItemVencido[] = [];
  for (const grupo of porItem.values()) {
    const calculados = grupo.map((r) => ({ r, ...totalDoItem(r) }));
    const n = calculados.length;
    const valorItem = n > 1 ? Math.max(...calculados.map((c) => c.total)) : calculados[0].total;
    for (const { r, comoTotal } of calculados) {
      itens.push({
        lote: r.nrLote,
        item: r.nrItem,
        descricao: r.dsItem,
        unidade: r.dsUnidadeMedida,
        quantidade: numero(r.nrQuantidadeVencedorLicitacao) || numero(r.nrQuantidade),
        precoMaximoUnitario: numero(r.vlMaximoUnitarioitem),
        valorMaximo: numero(r.vlMaximoTotal),
        valor: valorItem / n,
        vencedor: chaveDoc(r.nrDocumento),
        valorPublicadoComoTotal: comoTotal,
        divididoEntre: n,
      });
    }
  }

  const porVencedor = new Map<string, Vencedor>();
  for (const it of itens) {
    let v = porVencedor.get(it.vencedor);
    if (!v) {
      const nome = linhas.find((r) => chaveDoc(r.nrDocumento) === it.vencedor)?.nmPessoa;
      v = { ...fornecedor(it.vencedor, nome, cache), valor: 0, itens: 0 };
      porVencedor.set(it.vencedor, v);
    }
    v.valor += it.valor;
    v.itens++;
  }
  return { itens, vencedores: [...porVencedor.values()].sort((a, b) => b.valor - a.valor) };
}

async function montar(ano: number, cache: BaseCnpj): Promise<Licitacao[]> {
  const [lic, part, venc, lxc, contratos, empenhos, lxe, exc] = await Promise.all([
    registros(ano, "Licitacao"),
    registros(ano, "LicitacaoParticipante"),
    registros(ano, "LicitacaoVencedor"),
    registros(ano, "LicitacaoXContrato"),
    registros(ano, "Contrato"),
    registros(ano, "Empenho"),
    registros(ano, "LicitacaoXEmpenho"),
    registros(ano, "EmpenhoXContrato"),
  ]);
  const casarPncp = await casadorPncp(ano);
  const empenhoPorId = new Map(empenhos.map((e) => [e.idEmpenho, e]));
  const empenhosDe = (ids: Registro[] | undefined) =>
    (ids ?? []).map((x) => empenhoPorId.get(x.idEmpenho)).filter((e): e is Registro => !!e);
  const empenhosPorLicitacao = agrupar(lxe, "idLicitacao");
  const empenhosPorContrato = agrupar(exc, "idContrato");
  const partPor = agrupar(part, "idLicitacao");
  const vencPor = agrupar(venc, "idlicitacao");
  const contratoPorId = new Map(contratos.map((c) => [c.idContrato, c]));
  const contratosPor = agrupar(lxc, "idLicitacao");

  const ls: Licitacao[] = lic.map((r) => {
    const { itens, vencedores } = montarItens(vencPor.get(r.idLicitacao) ?? [], cache);
    const docsParticipantes = new Set((partPor.get(r.idLicitacao) ?? []).map((p) => chaveDoc(p.nrDocParticipanteLicitacao)));
    const homologacoes = (vencPor.get(r.idLicitacao) ?? []).map((v) => data(v.dtHomologacao)).filter(Boolean) as string[];
    const modalidade = MODALIDADES[r.dsModalidadeLicitacao] ?? r.dsModalidadeLicitacao;
    const idsContratos = (contratosPor.get(r.idLicitacao) ?? []).map((x) => x.idContrato);
    const secretaria =
      secretariaDe(empenhosDe(empenhosPorLicitacao.get(r.idLicitacao)), "empenho") ??
      secretariaDe(idsContratos.flatMap((c) => empenhosDe(empenhosPorContrato.get(c))), "contrato");
    return {
      id: r.idLicitacao,
      ano,
      entidade: {
        id: r.idPessoa,
        slug: slugEntidade(r.idPessoa, r.nmEntidade),
        nome: r.nmEntidade,
        curto: NOMES_CURTOS[r.idPessoa] ?? capitalizar(r.nmEntidade),
        principal: r.idPessoa === ID_PREFEITURA,
      },
      secretaria,
      modalidade,
      modalidadeOriginal: r.dsModalidadeLicitacao,
      numero: `${r.nrLicitacao}/${r.nrAnoLicitacao}`,
      processo: r.nrEditalOrigem && Number(r.nrEditalOrigem) ? `${Number(r.nrEditalOrigem)}/${r.nranoEditalOrigem}` : null,
      objeto: r.dsObjeto,
      tipoObjeto: tipoObjeto(r.dsClassificacaoObjetoLicitacao ?? ""),
      criterio: r.dsAvaliacaoLicitacao || null,
      situacao: r.dsTipoSituacaoLicitacao,
      dataEdital: data(r.dtEdital),
      dataAbertura: data(r.dtAbertura),
      dataHomologacao: homologacoes.sort()[0] ?? null,
      gestao: gestaoDe(r.dtAbertura || r.dtEdital),
      valorEstimado: numero(r.vlLicitacao),
      valorHomologado: itens.length ? itens.reduce((t, i) => t + i.valor, 0) : null,
      valorEstimadoItensVencidos: itens.length ? itens.reduce((t, i) => t + i.valorMaximo / i.divididoEntre, 0) : null,
      vencedores,
      participantes: docsParticipantes.size || null,
      itens,
      contratos: idsContratos
        .map((id) => contratoPorId.get(id))
        .filter((c): c is Registro => !!c)
        .map((c) => ({
          id: c.idContrato,
          numero: `${c.nrContrato}/${c.nrAnoContrato}`,
          ato: c.dsTipoAtoContrato,
          doc: c.nrDocContratado.replace(/\D/g, ""),
          contratado: c.nmContratado,
          valor: numero(c.vlContrato),
          assinatura: c.dtAssinatura?.slice(0, 10) ?? "",
          inicio: c.dtInicio?.slice(0, 10) ?? "",
          fim: c.dtFim?.slice(0, 10) ?? "",
        })),
      fonte: {
        arquivo: `${ano}_410830_Licitacao.xml`,
        dataReferencia: (r.DataReferencia ?? "").trim(),
        ultimoEnvio: r.ultimoEnvioSIMAMNesteExercicio ?? "",
      },
      pncp: { estado: "sem-chave" },
    };
  });
  for (const l of ls) l.pncp = casarPncp(l);
  return ls;
}

const montadas = new Map<number, { base: BaseCnpj; ls: Promise<Licitacao[]> }>();

/** Licitações do ano; remontadas quando a base de CNPJs muda. */
export async function licitacoes(ano: number): Promise<Licitacao[]> {
  const base = await baseCnpj();
  let m = montadas.get(ano);
  if (!m || m.base !== base) {
    m = { base, ls: montar(ano, base) };
    m.ls.catch(() => montadas.delete(ano));
    montadas.set(ano, m);
  }
  return m.ls;
}

export function entidadesDe(ls: Licitacao[]): (Entidade & { n: number })[] {
  const m = new Map<string, Entidade & { n: number }>();
  for (const l of ls) {
    const e = m.get(l.entidade.id) ?? { ...l.entidade, n: 0 };
    e.n++;
    m.set(l.entidade.id, e);
  }
  return [...m.values()].sort((a, b) => Number(b.principal) - Number(a.principal) || b.n - a.n);
}

/** Filtra pela entidade: sem parâmetro = só a prefeitura; "todas" = todas. */
export function filtrarEntidade(ls: Licitacao[], slug: string | undefined): Licitacao[] {
  if (slug === "todas") return ls;
  if (!slug) return ls.filter((l) => l.entidade.principal);
  return ls.filter((l) => l.entidade.slug === slug);
}

/** Procura a licitação pelo id do TCE-PR em todos os anos baixados. */
export async function licitacaoPorId(id: string): Promise<Licitacao | null> {
  if (!/^\d+$/.test(id)) return null;
  for (const ano of await anos()) {
    const l = (await licitacoes(ano)).find((x) => x.id === id);
    if (l) return l;
  }
  return null;
}
