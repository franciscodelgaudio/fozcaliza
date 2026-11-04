// Filtros da aba Obras do explorador (mesmo esquema de URL das licitações).

import { normalizar } from "@/lib/tce/consulta";
import { ATIVAS, type Alerta, type Obra } from "./modelo";

export type ParametrosObras = { q?: string; alerta?: string; periodo?: string; entidade?: string; sel?: string };

const CHAVES: (keyof ParametrosObras)[] = ["q", "alerta", "periodo", "entidade", "sel"];

type Fonte = Record<string, string | string[] | null | undefined>;

export function lerParametrosObras(sp: Fonte): ParametrosObras {
  const ler = (k: string) => {
    const v = sp[k];
    const s = (Array.isArray(v) ? v[0] : v)?.trim();
    return s || undefined;
  };
  return Object.fromEntries(CHAVES.map((k) => [k, ler(k)]).filter(([, v]) => v)) as ParametrosObras;
}

export function urlObras(p: ParametrosObras, troca: Partial<ParametrosObras>): string {
  const final = { ...p, ...troca };
  const u = new URLSearchParams({ aba: "obras" });
  for (const k of CHAVES) if (final[k]) u.set(k, final[k]!);
  return `/licitacoes/explorar?${u}`;
}

/** Ordem de gravidade na lista: o que mais pede atenção primeiro. */
const ORDEM: Record<Alerta, number> = {
  paralisada: 0,
  "sem-medicao": 1,
  "prazo-vencido": 2,
  "nao-iniciada": 3,
  "em-dia": 4,
  concluida: 5,
  cancelada: 6,
};

const buscaCache = new WeakMap<Obra, string>();
const textoBusca = (o: Obra) =>
  normalizar([o.nome, o.bairro, o.endereco, o.entidade, o.contrato?.contratado, o.contrato?.numero].filter(Boolean).join(" "));

export function consultarObras(todas: Obra[], p: ParametrosObras) {
  let ls = p.entidade === "todas" ? todas : todas.filter((o) => o.principal);
  const periodo = p.periodo ?? "ativas";
  if (periodo === "ativas") ls = ls.filter((o) => ATIVAS.includes(o.alerta));
  else if (periodo === "concluidas") ls = ls.filter((o) => o.alerta === "concluida");
  if (p.alerta) ls = ls.filter((o) => o.alerta === p.alerta);
  if (p.q) {
    const termos = normalizar(p.q).split(/\s+/).filter(Boolean);
    ls = ls.filter((o) => {
      let t = buscaCache.get(o);
      if (t === undefined) buscaCache.set(o, (t = textoBusca(o)));
      return termos.every((x) => t.includes(x));
    });
  }
  const ordenadas = [...ls].sort(
    (a, b) => Number(a.desatualizada) - Number(b.desatualizada) || ORDEM[a.alerta] - ORDEM[b.alerta] || b.valor - a.valor,
  );
  return { total: ls.length, valor: ls.reduce((t, o) => t + o.valor, 0), itens: ordenadas };
}
