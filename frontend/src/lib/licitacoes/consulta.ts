// Filtros do explorador de licitações (seção 5.2). Os mesmos parâmetros valem na
// URL da página /licitacoes/explorar e na API /api/licitacoes.

import { normalizar } from "@/lib/tce/consulta";
import { nomeCidade, type Fornecedor } from "./fornecedores";
import { filtrarEntidade, type Licitacao } from "./modelo";
import { sinaisDe } from "./sinais";

export const POR_PAGINA = 25;

export type ParametrosLicitacoes = {
  q?: string;
  modalidade?: string;
  gestao?: string;
  cidade?: string;
  uf?: string;
  entidade?: string;
  /** Mínimo de sinais de risco presentes ("1", "2", "3"). */
  sinais?: string;
  agrupar?: string;
  ordem?: string;
  pagina?: string;
  sel?: string;
};

const CHAVES: (keyof ParametrosLicitacoes)[] = ["q", "modalidade", "gestao", "cidade", "uf", "entidade", "sinais", "agrupar", "ordem", "pagina", "sel"];

/** Parâmetros que restringem a lista (o resto é navegação). */
export const FILTROS: (keyof ParametrosLicitacoes)[] = ["q", "modalidade", "gestao", "cidade", "uf", "entidade", "sinais"];

type Fonte = Record<string, string | string[] | null | undefined> | URLSearchParams;

export function lerParametrosLicitacoes(sp: Fonte): ParametrosLicitacoes {
  const ler = (k: string) => {
    const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
    const s = (Array.isArray(v) ? v[0] : v)?.trim();
    return s || undefined;
  };
  return Object.fromEntries(CHAVES.map((k) => [k, ler(k)]).filter(([, v]) => v)) as ParametrosLicitacoes;
}

/** URL com parâmetros trocados; `undefined` remove. Mudar filtro volta para a página 1. */
export function urlLicitacoes(base: string, p: ParametrosLicitacoes, troca: Partial<ParametrosLicitacoes>): string {
  const mudouFiltro = Object.keys(troca).some((k) => FILTROS.includes(k as keyof ParametrosLicitacoes));
  const final: ParametrosLicitacoes = { ...p, ...(mudouFiltro ? { pagina: undefined } : {}), ...troca };
  const u = new URLSearchParams();
  for (const k of CHAVES) if (final[k]) u.set(k, final[k]!);
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}

/** Nome para exibir: pessoa física não tem nome mostrado; CPF no fim da razão social de MEI é removido. */
export function nomeExibido(f: Pick<Fornecedor, "tipoDoc" | "nome">): string {
  if (f.tipoDoc === "CPF") return "Pessoa física";
  return f.nome.replace(/\s+\d{11}$/, "").trim() || "Fornecedor sem nome";
}

export const cidadeDe = (f: Pick<Fornecedor, "municipio" | "uf">) => nomeCidade(f.municipio, f.uf);

/** Valor usado na ordenação e no destaque da lista: homologado; sem vencedor, o estimado. */
export const valorDe = (l: Licitacao) => l.valorHomologado ?? l.valorEstimado;

function textoBusca(l: Licitacao): string {
  return normalizar(
    [
      l.objeto,
      l.modalidade,
      l.numero,
      l.secretaria?.nome,
      l.entidade.curto,
      ...l.vencedores.flatMap((v) => [nomeExibido(v), v.tipoDoc === "CNPJ" ? v.doc : "", v.municipio, v.uf]),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

const buscaCache = new WeakMap<Licitacao, string>();

export function filtrar(todas: Licitacao[], p: ParametrosLicitacoes): Licitacao[] {
  let ls = filtrarEntidade(todas, p.entidade);
  if (p.modalidade) ls = ls.filter((l) => l.modalidade === p.modalidade);
  if (p.gestao) ls = ls.filter((l) => l.gestao === p.gestao);
  if (p.uf) ls = ls.filter((l) => l.vencedores.some((v) => v.uf === p.uf));
  if (p.cidade) {
    const c = normalizar(p.cidade);
    ls = ls.filter((l) => l.vencedores.some((v) => v.municipio && normalizar(v.municipio) === c && (!p.uf || v.uf === p.uf)));
  }
  const minimo = Number(p.sinais);
  if (minimo > 0) {
    const s = sinaisDe(todas);
    ls = ls.filter((l) => (s.get(l.id)?.presentes ?? 0) >= minimo);
  }
  if (p.q) {
    const termos = normalizar(p.q).split(/\s+/).filter(Boolean);
    ls = ls.filter((l) => {
      let t = buscaCache.get(l);
      if (t === undefined) buscaCache.set(l, (t = textoBusca(l)));
      return termos.every((x) => t.includes(x));
    });
  }
  return ls;
}

export const ORDENS = [
  { valor: "valor", rotulo: "Maior valor" },
  { valor: "recentes", rotulo: "Mais recentes" },
] as const;

export function consultarLicitacoes(todas: Licitacao[], p: ParametrosLicitacoes) {
  const ls = filtrar(todas, p);
  const ordem = p.ordem === "recentes" ? "recentes" : "valor";
  const ordenadas = [...ls].sort((a, b) =>
    ordem === "recentes" ? (b.dataAbertura ?? "").localeCompare(a.dataAbertura ?? "") : valorDe(b) - valorDe(a),
  );
  const paginas = Math.max(1, Math.ceil(ordenadas.length / POR_PAGINA));
  const pagina = Math.min(paginas, Math.max(1, Number(p.pagina) || 1));
  return {
    total: ls.length,
    valorHomologado: ls.reduce((t, l) => t + (l.valorHomologado ?? 0), 0),
    semVencedor: ls.filter((l) => l.valorHomologado === null).length,
    ordem,
    pagina,
    paginas,
    itens: ordenadas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA),
    filtradas: ls,
  };
}

/** Opções dos filtros a partir dos dados (já restritos à entidade escolhida). */
export function opcoes(todas: Licitacao[], entidade: string | undefined) {
  const ls = filtrarEntidade(todas, entidade);
  const conta = (vals: (string | null)[]) => {
    const m = new Map<string, number>();
    for (const v of vals) if (v) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m].map(([valor, n]) => ({ valor, n })).sort((a, b) => b.n - a.n);
  };
  return {
    modalidades: conta(ls.map((l) => l.modalidade)),
    gestoes: conta(ls.map((l) => l.gestao)).sort((a, b) => b.valor.localeCompare(a.valor)),
    ufs: conta(ls.flatMap((l) => [...new Set(l.vencedores.map((v) => v.uf))])).sort((a, b) => a.valor.localeCompare(b.valor)),
  };
}

/** Versão enxuta para a lista (API e página). */
export function resumoLista(l: Licitacao) {
  const principal = l.vencedores[0];
  return {
    id: l.id,
    entidade: l.entidade.curto,
    secretaria: l.secretaria,
    modalidade: l.modalidade,
    numero: l.numero,
    gestao: l.gestao,
    objeto: l.objeto,
    situacao: l.situacao,
    dataAbertura: l.dataAbertura,
    valorEstimado: l.valorEstimado,
    valorHomologado: l.valorHomologado,
    vencedor: principal ? { nome: nomeExibido(principal), cidade: cidadeDe(principal), origem: principal.origem } : null,
    outrosVencedores: Math.max(0, l.vencedores.length - 1),
  };
}

const ehPessoaFisica = (doc: string) => doc.includes("*") || doc.replace(/\D/g, "").length === 11;

/** Licitação pronta para publicar: sem nome de pessoa física e sem CPF de MEI na razão social. */
export function publica(l: Licitacao): Licitacao {
  return {
    ...l,
    vencedores: l.vencedores.map((v) => ({ ...v, nome: nomeExibido(v), doc: v.tipoDoc === "CPF" ? "" : v.doc })),
    itens: l.itens.map((i) => (ehPessoaFisica(i.vencedor) ? { ...i, vencedor: "" } : i)),
    contratos: l.contratos.map((c) =>
      ehPessoaFisica(c.doc) ? { ...c, contratado: "Pessoa física", doc: "" } : { ...c, contratado: c.contratado.replace(/\s+\d{11}$/, "") },
    ),
  };
}
