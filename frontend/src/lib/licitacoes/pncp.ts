// Contratações do PNCP (Portal Nacional de Contratações Públicas) publicadas por
// órgãos de Foz do Iguaçu, gravadas por scripts/baixar-pncp.mjs em dados/pncp/<ano>/.
// Servem para duas coisas: saber se e quando o edital saiu no portal nacional
// (sinal 3) e listar os documentos publicados (edital, atas, contratos).
//
// Casamento com a licitação do TCE-PR: pelo número do processo administrativo
// (TCE `nrEditalOrigem/nranoEditalOrigem` = PNCP `processo`), na mesma entidade
// (CNPJ). Só vale com um único candidato.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Licitacao } from "./modelo";

export const PASTA_PNCP = process.env.PNCP_DADOS ?? join(process.cwd(), "..", "dados", "pncp");

/** CNPJ de cada entidade do TCE-PR (idPessoa), para casar com o órgão do PNCP. */
const CNPJ_ENTIDADE: Record<string, string> = {
  "12294": "76206606000140", // Município de Foz do Iguaçu
};

export type DocumentoPncp = { titulo: string; tipo: string; url: string; publicadoEm: string | null };

export type CompraPncp = {
  numeroControle: string;
  cnpj: string;
  orgao: string;
  ano: number;
  sequencial: number;
  processo: string | null;
  modalidade: string;
  objeto: string;
  publicadoEm: string | null;
  aberturaPropostas: string | null;
  encerramentoPropostas: string | null;
  situacao: string;
  valorEstimado: number | null;
  valorHomologado: number | null;
  /** Página pública da compra no PNCP. */
  url: string;
  documentos: DocumentoPncp[];
};

type Bruto = Record<string, unknown> & { numeroControlePNCP: string };

/** "85.159/2025" ou "85159/2025 " → "85159/2025"; sem número/ano reconhecível → null. */
export function chaveProcesso(v: unknown): string | null {
  const m = /^\s*([\d.]+)\s*\/\s*(\d{4})/.exec(String(v ?? ""));
  if (!m) return null;
  const n = Number(m[1].replaceAll(".", ""));
  return n ? `${n}/${m[2]}` : null;
}

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const numero = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

async function lerAno(ano: number): Promise<CompraPncp[]> {
  const ler = async (nome: string) => {
    try {
      return JSON.parse(await readFile(join(PASTA_PNCP, String(ano), nome), "utf8"));
    } catch {
      return [];
    }
  };
  const [contratacoes, arquivos]: [Bruto[], { numeroControlePNCP: string; arquivos: Record<string, unknown>[] }[]] = await Promise.all([
    ler("contratacoes.json"),
    ler("arquivos.json"),
  ]);
  const docs = new Map(arquivos.map((a) => [a.numeroControlePNCP, a.arquivos]));
  return contratacoes.map((c) => {
    const org = (c.orgaoEntidade ?? {}) as Record<string, unknown>;
    const cnpj = String(org.cnpj ?? "");
    const anoCompra = Number(c.anoCompra);
    const seq = Number(c.sequencialCompra);
    return {
      numeroControle: c.numeroControlePNCP,
      cnpj,
      orgao: texto(org.razaoSocial) ?? cnpj,
      ano: anoCompra,
      sequencial: seq,
      processo: chaveProcesso(c.processo),
      modalidade: texto(c.modalidadeNome) ?? "",
      objeto: texto(c.objetoCompra) ?? "",
      publicadoEm: texto(c.dataPublicacaoPncp)?.slice(0, 10) ?? null,
      aberturaPropostas: texto(c.dataAberturaProposta)?.slice(0, 10) ?? null,
      encerramentoPropostas: texto(c.dataEncerramentoProposta)?.slice(0, 10) ?? null,
      situacao: texto(c.situacaoCompraNome) ?? "",
      valorEstimado: numero(c.valorTotalEstimado),
      valorHomologado: numero(c.valorTotalHomologado),
      url: `https://pncp.gov.br/app/editais/${cnpj}/${anoCompra}/${seq}`,
      documentos: (docs.get(c.numeroControlePNCP) ?? [])
        .filter((d) => d.statusAtivo !== false)
        .map((d) => ({
          titulo: texto(d.titulo) ?? "Documento",
          tipo: texto(d.tipoDocumentoNome) ?? texto(d.tipoDocumentoDescricao) ?? "Documento",
          url: String(d.url ?? d.uri ?? ""),
          publicadoEm: texto(d.dataPublicacaoPncp)?.slice(0, 10) ?? null,
        }))
        .filter((d) => d.url),
    };
  });
}

const cache = new Map<number, Promise<Map<string, CompraPncp[]>>>();

/** Compras do PNCP do ano, indexadas por "cnpj|processo". */
function indice(ano: number): Promise<Map<string, CompraPncp[]>> {
  let p = cache.get(ano);
  if (!p) {
    p = lerAno(ano).then((cs) => {
      const m = new Map<string, CompraPncp[]>();
      for (const c of cs) {
        if (!c.processo) continue;
        const k = `${c.cnpj}|${c.processo}`;
        m.set(k, [...(m.get(k) ?? []), c]);
      }
      return m;
    });
    p.catch(() => cache.delete(ano));
    cache.set(ano, p);
  }
  return p;
}

/** Há dados do PNCP baixados para o ano? (Sem eles, o sinal 3 fica "sem informação".) */
export async function temPncp(ano: number): Promise<boolean> {
  try {
    await readFile(join(PASTA_PNCP, String(ano), "fonte.json"));
    return true;
  } catch {
    return false;
  }
}

export type CasamentoPncp =
  | { estado: "achada"; compra: CompraPncp }
  | { estado: "nao-achada" }
  | { estado: "sem-chave" }
  | { estado: "ambigua"; candidatos: number };

/** Função que acha a compra do PNCP de uma licitação do TCE-PR. */
export async function casadorPncp(ano: number): Promise<(l: Licitacao) => CasamentoPncp> {
  const idx = await indice(ano);
  return (l) => {
    const cnpj = CNPJ_ENTIDADE[l.entidade.id];
    if (!cnpj || !l.processo) return { estado: "sem-chave" };
    const cs = idx.get(`${cnpj}|${l.processo}`) ?? [];
    if (cs.length === 1) return { estado: "achada", compra: cs[0] };
    if (cs.length > 1) return { estado: "ambigua", candidatos: cs.length };
    return { estado: "nao-achada" };
  };
}
