// Projetos do Obrasgov.br (obras com recurso federal) em Foz do Iguaçu, gravados por
// scripts/baixar-obrasgov.mjs em dados/obrasgov/. Traz o percentual de execução
// física e o histórico de paralisações, que o TCE-PR não publica.
//
// Casamento com a obra do TCE-PR (só quando inequívoco), nesta ordem:
// 1. um contrato do projeto no Obrasgov tem o mesmo CNPJ e o mesmo valor (± R$ 1)
//    do contrato achado para a obra;
// 2. um único projeto tem contrato com o valor exato da obra (± R$ 1);
// 3. nome: entre os projetos executados pelo município, um único com ao menos 2
//    palavras distintivas em comum e semelhança ≥ 50% (sem empate). A API não
//    publica as coordenadas, então não dá para casar pelo local.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizar } from "@/lib/tce/consulta";
import type { Obra } from "./modelo";

export const PASTA_OBRASGOV = process.env.OBRASGOV_DADOS ?? join(process.cwd(), "..", "dados", "obrasgov");

type Linha = Record<string, unknown> & { id_projeto_investimento: string };

export type ObraFederal = {
  id: string;
  nome: string;
  situacao: string;
  /** Percentual de execução física mais recente (0–100), ou null se não informado. */
  percentual: number | null;
  atualizadoEm: string | null;
  /** Justificativa da paralisação mais recente, se houver. */
  paralisacao: string | null;
  executor: string | null;
};

type Projeto = ObraFederal & { contratos: { cnpj: string; valor: number }[]; municipal: boolean; palavras: Set<string> };
export type BaseObrasgov = { atualizadoEm: string | null; projetos: Projeto[] };

async function ler(nome: string): Promise<Linha[]> {
  try {
    return JSON.parse(await readFile(join(PASTA_OBRASGOV, `${nome}.json`), "utf8"));
  } catch {
    return [];
  }
}

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const numero = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

// Palavras que não distinguem uma obra de outra.
const COMUNS = new Set(
  "de da do das dos em no na para com pelo pela municipio foz iguacu parana construcao construir reforma implantacao execucao obra obras servicos sistema regiao bairro rua avenida".split(
    " ",
  ),
);
export const palavras = (s: string) => new Set(normalizar(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !COMUNS.has(t)));

let cache: Promise<BaseObrasgov> | null = null;

export function baseObrasgov(): Promise<BaseObrasgov> {
  if (!cache) {
    cache = (async () => {
      const [projetos, execucao, historico, contratos, fonte] = await Promise.all([
        ler("projetos"),
        ler("execucao-fisica"),
        ler("historico-paralisacao"),
        ler("contratos"),
        readFile(join(PASTA_OBRASGOV, "fonte.json"), "utf8").then(JSON.parse, () => null),
      ]);
      const agrupar = (ls: Linha[]) => {
        const m = new Map<string, Linha[]>();
        for (const l of ls) m.set(l.id_projeto_investimento, [...(m.get(l.id_projeto_investimento) ?? []), l]);
        return m;
      };
      const exe = agrupar(execucao);
      const hist = agrupar(historico);
      const cts = agrupar(contratos);
      return {
        atualizadoEm: fonte?.data_ultima_atualizacao?.slice(0, 10) ?? null,
        projetos: projetos.map((p) => {
          const ex = [...(exe.get(p.id_projeto_investimento) ?? [])].sort((a, b) =>
            String(a.dt_atualizacao_execucao ?? a.dt_cadastro_execucao ?? "").localeCompare(String(b.dt_atualizacao_execucao ?? b.dt_cadastro_execucao ?? "")),
          );
          const ultimo = ex[ex.length - 1];
          const hs = [...(hist.get(p.id_projeto_investimento) ?? [])].sort((a, b) =>
            String(a.data_historico_situacao_investimento ?? "").localeCompare(String(b.data_historico_situacao_investimento ?? "")),
          );
          const h = hs[hs.length - 1];
          const executores = Array.isArray(p.executores) ? (p.executores as Record<string, unknown>[]) : [];
          const nomesExecutores = executores.map((e) => normalizar(String(e.organizacao_executor ?? "")));
          return {
            id: p.id_projeto_investimento,
            nome: texto(p.desc_nome) ?? p.id_projeto_investimento,
            situacao: texto(p.situacao) ?? "—",
            percentual: ultimo ? numero(ultimo.percentual_execucao_fisica) : null,
            atualizadoEm: texto(ultimo?.dt_atualizacao_execucao)?.slice(0, 10) ?? null,
            paralisacao: h ? texto(h.justificativa_cancelada_paralisada) ?? texto(h.descricao_historico_situacao_investimento) : null,
            executor: texto(executores[0]?.organizacao_executor),
            municipal: nomesExecutores.some((n) => n.includes("foz do iguacu") || n.includes("fundo municipal")),
            palavras: palavras(texto(p.desc_nome) ?? ""),
            contratos: (cts.get(p.id_projeto_investimento) ?? []).map((c) => ({
              cnpj: digitos(c.cnpj_fornecedor_contrato),
              valor: Number(c.valor_global_contrato) || 0,
            })),
          };
        }),
      };
    })();
    cache.catch(() => (cache = null));
  }
  return cache;
}

const semInternos = (p: Projeto): ObraFederal => ({
  id: p.id,
  nome: p.nome,
  situacao: p.situacao,
  percentual: p.percentual,
  atualizadoEm: p.atualizadoEm,
  paralisacao: p.paralisacao,
  executor: p.executor,
});

/** Função que acha o projeto do Obrasgov de uma obra do TCE-PR (ou null). */
export async function obrasgovPorObra(): Promise<(o: Obra) => ObraFederal | null> {
  const { projetos } = await baseObrasgov();
  const perto = (a: number, b: number) => a > 0 && Math.abs(a - b) <= 1;
  const municipais = projetos.filter((p) => p.municipal);
  return (o) => {
    const c = o.contrato;
    const doc = digitos(c?.doc);
    const porContrato = c
      ? projetos.filter((p) => p.contratos.some((x) => x.cnpj === doc && (perto(x.valor, c.valorInicial) || perto(x.valor, c.valorAtual))))
      : [];
    if (porContrato.length === 1) return semInternos(porContrato[0]);
    const porValor = projetos.filter((p) => p.contratos.some((x) => perto(x.valor, o.valor)));
    if (porValor.length === 1) return semInternos(porValor[0]);

    if (!o.principal) return null;
    const minhas = palavras(o.nome);
    const notas = municipais
      .map((p) => {
        const comuns = [...minhas].filter((t) => p.palavras.has(t)).length;
        return { p, comuns, nota: comuns / new Set([...minhas, ...p.palavras]).size };
      })
      .filter((x) => x.comuns >= 2 && x.nota >= 0.5)
      .sort((a, b) => b.nota - a.nota);
    if (!notas.length || (notas[1] && notas[0].nota - notas[1].nota < 0.1)) return null;
    return semInternos(notas[0].p);
  };
}
