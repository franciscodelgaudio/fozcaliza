// Filtro, ordenação e paginação de registros em memória (vindos da URL).

import { numero, type Registro } from "./dados";

export const POR_PAGINA = 50;

export type Parametros = { q?: string; entidade?: string; ordem?: string; pagina?: string };

export function lerParametros(sp: Record<string, string | string[] | undefined>): Parametros {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  return { q: um(sp.q), entidade: um(sp.entidade), ordem: um(sp.ordem), pagina: um(sp.pagina) };
}

export const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

type Linha = { r: Registro; posicao: number };

export function consultar(
  rs: Registro[],
  p: Parametros,
  opcoes: { busca: string[]; valor?: string; data?: string },
) {
  let linhas: Linha[] = rs.map((r, posicao) => ({ r, posicao }));

  if (p.entidade) linhas = linhas.filter(({ r }) => (r.nmEntidade || "") === p.entidade);

  if (p.q) {
    const termos = normalizar(p.q).split(/\s+/).filter(Boolean);
    const campos = opcoes.busca.length ? opcoes.busca : null;
    linhas = linhas.filter(({ r }) => {
      const texto = normalizar((campos ? campos.map((c) => r[c] ?? "") : Object.values(r)).join(" "));
      return termos.every((t) => texto.includes(t));
    });
  }

  const ordem = p.ordem ?? (opcoes.valor ? "valor" : opcoes.data ? "data" : "arquivo");
  if (ordem === "valor" && opcoes.valor) {
    const c = opcoes.valor;
    linhas.sort((a, b) => numero(b.r[c]) - numero(a.r[c]));
  } else if (ordem === "data" && opcoes.data) {
    const c = opcoes.data;
    linhas.sort((a, b) => (b.r[c] ?? "").localeCompare(a.r[c] ?? ""));
  }

  const total = linhas.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(paginas, Math.max(1, Number(p.pagina) || 1));
  const soma = opcoes.valor ? linhas.reduce((t, { r }) => t + numero(r[opcoes.valor!]), 0) : undefined;

  return {
    total,
    soma,
    pagina,
    paginas,
    ordem,
    itens: linhas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA),
  };
}

export function entidades(rs: Registro[]): { nome: string; n: number }[] {
  const m = new Map<string, number>();
  for (const r of rs) if (r.nmEntidade) m.set(r.nmEntidade, (m.get(r.nmEntidade) ?? 0) + 1);
  return [...m].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n);
}

/** Monta a URL atual com parâmetros trocados. */
export function urlCom(base: string, p: Parametros, troca: Partial<Parametros>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...p, ...troca })) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}
