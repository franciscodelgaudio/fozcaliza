// Comparação de preço de itens de engenharia com o SINAPI-PR (Caixa/IBGE), gravado por
// scripts/baixar-sinapi.mjs em dados/sinapi/<AAAA-MM>/, e a cesta curada em
// dados/precos/cesta-sinapi.json (cada correspondência conferida à mão).
//
// Faixa de referência = preço SINAPI × (1 + BDI), com os quartis do TCU para
// fornecimento de materiais. O SINAPI é "posto usina", coletado na capital: o frete
// até Foz não está incluído, o que puxa o preço de Foz para cima de forma legítima.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ItemVencido, Licitacao } from "@/lib/licitacoes/modelo";
import { normalizar } from "@/lib/tce/consulta";

const DADOS = join(process.cwd(), "..", "dados");
export const PASTA_SINAPI = process.env.SINAPI_DADOS ?? join(DADOS, "sinapi");
const CESTA = join(DADOS, "precos", "cesta-sinapi.json");

type Insumo = { codigo: string; descricao: string; unidade: string; origem: string; preco: number | null };
type ItemCesta = { id: string; nome: string; termos: string[]; unidade: string; sinapi: string[]; bdi: string; nota: string; aproximada?: boolean };
type Cesta = { bdi: { fonte: string } & Record<string, { primeiro_quartil: number; medio: number; terceiro_quartil: number }>; itens: ItemCesta[] };

export type Comparacao = {
  item: ItemVencido;
  cesta: { id: string; nome: string; nota: string; aproximada: boolean };
  unidade: string;
  /** Preço unitário pago por Foz (valor vencido ÷ quantidade). */
  pago: number;
  /** Faixa de referência (SINAPI × BDI do 1º ao 3º quartil) e preço típico (BDI médio). */
  faixa: { min: number; max: number; tipico: number };
  sinapi: { codigos: string[]; precos: number[]; mes: string; descricao: string };
  /** Quanto o preço pago passa do topo da faixa (0 se dentro ou abaixo). */
  acima: number;
  situacao: "abaixo" | "dentro" | "acima";
};

type Base = { mes: string; insumos: Map<string, Insumo>; cesta: Cesta; bdiFonte: string } | null;

let cache: Promise<Base> | null = null;

async function carregar(): Promise<Base> {
  let meses: string[];
  try {
    meses = (await readdir(PASTA_SINAPI)).filter((m) => /^\d{4}-\d{2}$/.test(m)).sort();
  } catch {
    return null;
  }
  const mes = meses.at(-1);
  if (!mes) return null;
  const [insumos, cesta] = await Promise.all([
    readFile(join(PASTA_SINAPI, mes, "insumos-pr.json"), "utf8").then((t) => JSON.parse(t) as Insumo[]),
    readFile(CESTA, "utf8").then((t) => JSON.parse(t) as Cesta),
  ]);
  return { mes, insumos: new Map(insumos.map((i) => [i.codigo, i])), cesta, bdiFonte: cesta.bdi.fonte };
}

export function baseSinapi(): Promise<Base> {
  if (!cache) {
    cache = carregar();
    cache.catch(() => (cache = null));
  }
  return cache;
}

/** Comparações dos itens vencidos de uma licitação que estão na cesta. */
export async function compararLicitacao(l: Licitacao): Promise<Comparacao[]> {
  const base = await baseSinapi();
  if (!base) return [];
  const saida: Comparacao[] = [];
  for (const item of l.itens) {
    const desc = normalizar(item.descricao);
    const c = base.cesta.itens.find((x) => x.termos.every((t) => desc.includes(normalizar(t))));
    if (!c || !item.quantidade) continue;
    const insumos = c.sinapi.map((k) => base.insumos.get(k)).filter((i): i is Insumo => !!i && i.preco !== null && i.preco > 0);
    if (!insumos.length) continue;
    const bdi = base.cesta.bdi[c.bdi];
    const precos = insumos.map((i) => i.preco!);
    const min = Math.min(...precos) * (1 + bdi.primeiro_quartil);
    const max = Math.max(...precos) * (1 + bdi.terceiro_quartil);
    const tipico = (precos.reduce((a, b) => a + b, 0) / precos.length) * (1 + bdi.medio);
    const pago = item.valor / item.quantidade;
    saida.push({
      item,
      cesta: { id: c.id, nome: c.nome, nota: c.nota, aproximada: !!c.aproximada },
      unidade: c.unidade,
      pago,
      faixa: { min, max, tipico },
      sinapi: { codigos: insumos.map((i) => i.codigo), precos, mes: base.mes, descricao: insumos[0].descricao },
      acima: pago > max ? pago / max - 1 : 0,
      situacao: pago > max ? "acima" : pago < min ? "abaixo" : "dentro",
    });
  }
  return saida;
}

/** Todas as comparações de um conjunto de licitações (para a história). */
export async function compararTodas(ls: Licitacao[]): Promise<(Comparacao & { licitacao: Licitacao })[]> {
  const r = await Promise.all(ls.map(async (l) => (await compararLicitacao(l)).map((c) => ({ ...c, licitacao: l }))));
  return r.flat();
}

const UNIDADES: Record<string, string> = { t: "tonelada", m2: "metro quadrado", m3: "metro cúbico", m: "metro", kg: "quilo", l: "litro" };
/** "t" → "tonelada". */
export const unidadePorExtenso = (u: string) => UNIDADES[u.toLowerCase()] ?? u;

export async function fonteSinapi(): Promise<{ mes: string; bdi: string } | null> {
  const b = await baseSinapi();
  return b ? { mes: b.mes, bdi: b.bdiFonte } : null;
}
