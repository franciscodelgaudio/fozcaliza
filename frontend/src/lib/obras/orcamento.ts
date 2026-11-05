// Orçamento-base das obras (planilha publicada no Portal da Transparência da
// prefeitura), extraído por scripts/baixar-portal-obras.mjs em
// dados/portal-foz/orcamentos/. Mostra de onde vem o preço de cada item e confere os
// itens SINAPI contra o SINAPI-PR do mesmo mês-base (dados/sinapi/<mês>/).
//
// O que importa para quem fiscaliza: item SINAPI é verificável na tabela oficial;
// composição própria da prefeitura, cotação e tabela privada não são.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { normalizar } from "@/lib/tce/consulta";
import { PASTA_PORTAL } from "./portal";

const PASTA_SINAPI = process.env.SINAPI_DADOS ?? join(process.cwd(), "..", "dados", "sinapi");

export type Origem = "sinapi" | "sinapi-adaptada" | "outra-oficial" | "propria" | "cotacao" | "privada" | "nao-identificada";

export const ROTULO_ORIGEM: Record<Origem, string> = {
  sinapi: "SINAPI (tabela oficial federal)",
  "sinapi-adaptada": "SINAPI adaptado pela prefeitura",
  "outra-oficial": "Outras tabelas oficiais (DER-PR, SICRO, de outros estados)",
  propria: "Composições próprias da prefeitura",
  cotacao: "Cotações de mercado",
  privada: "Tabelas privadas",
  "nao-identificada": "Fonte não identificada",
};

/** Verificável numa tabela oficial pública? */
export const VERIFICAVEL: Record<Origem, boolean> = {
  sinapi: true,
  "sinapi-adaptada": false,
  "outra-oficial": true,
  propria: false,
  cotacao: false,
  privada: false,
  "nao-identificada": false,
};

const OFICIAIS = /^(sicro|der|orse|seinfra|sudecap|emop|sedop|setop|cpos|cdhu|agetop|iopes|fde|siurb|goinfra|dnit|caern|sco|sbc-?gov|seop)/;

export function origemDe(fonte: string, codigo: string): Origem {
  const f = normalizar(fonte).replace(/\s+/g, "");
  if (/^sinapi/.test(f)) return /\/|adapt/.test(f) || /\d[a-z]$/i.test(codigo.trim()) ? "sinapi-adaptada" : "sinapi";
  if (/cota/.test(f)) return "cotacao";
  if (/^(pmfi|prc|pm_|pm-|compos|propri|foz)/.test(f) || /^foz-/i.test(codigo)) return "propria";
  if (/^sbc/.test(f)) return "privada";
  if (OFICIAIS.test(f)) return "outra-oficial";
  return "nao-identificada";
}

type Item = { fonte: string; codigo: string; descricao: string; unidade: string; quantidade: number; custo: number | null; precoComBdi: number | null };
type Bruto = {
  idOxy: string;
  planilha: { tipo: string; valorTotal: number | null; dataBase: string | null };
  aditivo?: boolean;
  arquivo: { nome: string; sha256: string; interno: string | null };
  leitura: "lida" | "nao-lida";
  motivo: string | null;
  sinapi: { dataBase: string | null; localidade: string | null } | null;
  itens: Item[];
};

export type ItemDivergente = { codigo: string; descricao: string; unidade: string; usado: number; sinapi: number; impacto: number };

export type Orcamento = {
  arquivo: string;
  aditivo: boolean;
  leitura: "lida" | "nao-lida";
  motivo: string | null;
  itens: number;
  /** Total pelos custos unitários (sem BDI quando a planilha separa). */
  total: number;
  porOrigem: { origem: Origem; rotulo: string; valor: number; fracao: number; itens: number }[];
  /** Fração do valor verificável em tabela oficial. */
  verificavel: number;
  maioresSemReferencia: { origem: Origem; fonte: string; descricao: string; unidade: string; valor: number }[];
  sinapi: {
    dataBase: string | null;
    /** Itens SINAPI conferidos no SINAPI-PR do mês-base (null se o mês não está disponível). */
    conferidos: number | null;
    iguais: number | null;
    divergentes: ItemDivergente[];
    /** Soma de (custo usado − SINAPI) × quantidade nos itens acima do SINAPI. */
    acima: number;
  };
};

const sinapiCache = new Map<string, Promise<Map<string, number> | null>>();
function precosSinapi(mes: string) {
  let p = sinapiCache.get(mes);
  if (!p) {
    p = (async () => {
      try {
        const [c, i] = await Promise.all([
          readFile(join(PASTA_SINAPI, mes, "composicoes-pr.json"), "utf8").then((t) => JSON.parse(t) as { codigo: string; custo: number | null }[]),
          readFile(join(PASTA_SINAPI, mes, "insumos-pr.json"), "utf8").then((t) => JSON.parse(t) as { codigo: string; preco: number | null }[]),
        ]);
        const m = new Map<string, number>();
        for (const x of i) if (x.preco) m.set(x.codigo, x.preco);
        for (const x of c) if (x.custo) m.set(x.codigo, x.custo);
        return m;
      } catch {
        return null;
      }
    })();
    sinapiCache.set(mes, p);
  }
  return p;
}

async function resumir(b: Bruto): Promise<Orcamento> {
  const porOrigem = new Map<Origem, { valor: number; itens: number }>();
  const semRef: Orcamento["maioresSemReferencia"] = [];
  let total = 0;
  for (const it of b.itens) {
    const unit = it.custo ?? it.precoComBdi ?? 0;
    const v = unit * it.quantidade;
    total += v;
    const o = origemDe(it.fonte, it.codigo);
    const x = porOrigem.get(o) ?? { valor: 0, itens: 0 };
    x.valor += v;
    x.itens++;
    porOrigem.set(o, x);
    if (!VERIFICAVEL[o]) semRef.push({ origem: o, fonte: it.fonte, descricao: it.descricao, unidade: it.unidade, valor: v });
  }

  const mes = b.sinapi?.dataBase ?? null;
  const tabela = mes ? await precosSinapi(mes) : null;
  const divergentes: ItemDivergente[] = [];
  let conferidos: number | null = null;
  let iguais: number | null = null;
  if (tabela) {
    conferidos = 0;
    iguais = 0;
    for (const it of b.itens) {
      if (origemDe(it.fonte, it.codigo) !== "sinapi" || it.custo === null) continue;
      const ref = tabela.get(it.codigo.trim());
      if (ref === undefined) continue;
      conferidos++;
      if (Math.abs(it.custo / ref - 1) <= 0.005) iguais++;
      else divergentes.push({ codigo: it.codigo, descricao: it.descricao, unidade: it.unidade, usado: it.custo, sinapi: ref, impacto: (it.custo - ref) * it.quantidade });
    }
  }
  divergentes.sort((a, b) => b.impacto - a.impacto);

  const lista = [...porOrigem]
    .map(([origem, x]) => ({ origem, rotulo: ROTULO_ORIGEM[origem], valor: x.valor, fracao: total ? x.valor / total : 0, itens: x.itens }))
    .sort((a, b) => b.valor - a.valor);
  return {
    arquivo: b.arquivo.interno ? `${b.arquivo.nome} › ${b.arquivo.interno}` : b.arquivo.nome,
    aditivo: !!b.aditivo,
    leitura: b.leitura,
    motivo: b.motivo,
    itens: b.itens.length,
    total,
    porOrigem: lista,
    verificavel: lista.filter((x) => VERIFICAVEL[x.origem]).reduce((t, x) => t + x.fracao, 0),
    maioresSemReferencia: semRef.sort((a, b) => b.valor - a.valor).slice(0, 5),
    sinapi: { dataBase: mes, conferidos, iguais, divergentes: divergentes.slice(0, 5), acima: divergentes.filter((d) => d.impacto > 0).reduce((t, d) => t + d.impacto, 0) },
  };
}

let indice: Promise<Map<string, Bruto[]>> | null = null;
function brutos() {
  if (!indice) {
    indice = (async () => {
      const m = new Map<string, Bruto[]>();
      let nomes: string[] = [];
      try {
        nomes = await readdir(join(PASTA_PORTAL, "orcamentos"));
      } catch {
        return m;
      }
      for (const n of nomes.filter((x) => x.endsWith(".json"))) {
        const b = JSON.parse(await readFile(join(PASTA_PORTAL, "orcamentos", n), "utf8")) as Bruto;
        m.set(b.idOxy, [...(m.get(b.idOxy) ?? []), b]);
      }
      return m;
    })();
    indice.catch(() => (indice = null));
  }
  return indice;
}

/**
 * Orçamento-base de uma obra do portal: a planilha lida com mais itens, preferindo a que
 * não é de aditivo. Sem planilha lida, devolve a primeira não lida (com o motivo).
 */
export async function orcamentoDaObra(idOxy: string): Promise<Orcamento | null> {
  const bs = (await brutos()).get(idOxy) ?? [];
  if (!bs.length) return null;
  const ordenados = [...bs].sort(
    (a, b) => Number(b.leitura === "lida") - Number(a.leitura === "lida") || Number(!!a.aditivo) - Number(!!b.aditivo) || b.itens.length - a.itens.length,
  );
  return resumir(ordenados[0]);
}
