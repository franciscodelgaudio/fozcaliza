// Contratações do PNCP (Portal Nacional de Contratações Públicas) publicadas por
// órgãos de Foz do Iguaçu, gravadas por scripts/baixar-pncp.mjs em dados/pncp/<ano>/.
// Servem para duas coisas: saber se e quando o edital saiu no portal nacional
// (sinal 3) e listar os documentos publicados (edital, atas, contratos).
//
// Casamento com a licitação do TCE-PR, do mais seguro ao menos seguro (validado com
// os dados de 2026; o número do processo sozinho erra nos dois sentidos):
// 1. mesmo órgão, valor estimado igual ao centavo e objeto parecido;
// 2. mesmo órgão, mesmo número de processo e objeto parecido;
// 3. qualquer órgão de Foz, objeto muito parecido, valor até 25% diferente e
//    publicação até 120 dias antes da abertura.
// Republicações (mesmo valor e objeto) contam como achadas: fica a publicação mais
// próxima, antes da abertura.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizar } from "@/lib/tce/consulta";
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

const cache = new Map<number, Promise<CompraPncp[]>>();

function compras(ano: number): Promise<CompraPncp[]> {
  let p = cache.get(ano);
  if (!p) {
    p = lerAno(ano);
    p.catch(() => cache.delete(ano));
    cache.set(ano, p);
  }
  return p;
}

// Palavras que não distinguem um objeto de outro.
const COMUNS = new Set(
  "para pela pelo como entre sobre conforme demais futura eventual registro precos contratacao empresa especializada aquisicao servicos prestacao municipio iguacu municipal secretaria atender destinados necessidades edital anexos termo referencia".split(
    " ",
  ),
);
const palavras = (s: string) => new Set(normalizar(s).split(/[^a-z0-9]+/).filter((t) => t.length > 3 && !COMUNS.has(t)));
/** Semelhança de Jaccard entre as palavras distintivas dos dois objetos. */
function semelhanca(a: Set<string>, b: Set<string>) {
  const comuns = [...a].filter((t) => b.has(t)).length;
  return comuns / Math.max(1, new Set([...a, ...b]).size);
}

export type CasamentoPncp =
  | { estado: "achada"; compra: CompraPncp; como: "valor" | "processo" | "objeto"; publicacoes: number }
  | { estado: "nao-achada" }
  | { estado: "sem-dados" };

const diasEntre = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

/** Entre republicações, a mais próxima antes da abertura (ou a primeira). */
function escolher(cs: CompraPncp[], abertura: string | null): CompraPncp {
  const ordenadas = [...cs].sort((a, b) => (a.publicadoEm ?? "").localeCompare(b.publicadoEm ?? ""));
  const antes = abertura ? ordenadas.filter((c) => c.publicadoEm && c.publicadoEm <= abertura) : [];
  return antes.length ? antes[antes.length - 1] : ordenadas[0];
}

/** Função que acha a compra do PNCP de uma licitação do TCE-PR. */
export async function casadorPncp(ano: number): Promise<(l: Licitacao) => CasamentoPncp> {
  const todas = await compras(ano);
  const comPalavras = todas.map((c) => ({ c, p: palavras(c.objeto) }));
  return (l) => {
    const cnpj = CNPJ_ENTIDADE[l.entidade.id];
    if (!todas.length || !cnpj) return { estado: "sem-dados" };
    const minhas = palavras(l.objeto);
    const doOrgao = comPalavras.filter((x) => x.c.cnpj === cnpj);
    const achada = (xs: { c: CompraPncp }[], como: "valor" | "processo" | "objeto"): CasamentoPncp => ({
      estado: "achada",
      compra: escolher(
        xs.map((x) => x.c),
        l.dataAbertura,
      ),
      como,
      publicacoes: xs.length,
    });

    const porValor = doOrgao.filter((x) => x.c.valorEstimado !== null && Math.abs(x.c.valorEstimado - l.valorEstimado) < 0.01 && semelhanca(minhas, x.p) >= 0.3);
    if (porValor.length) return achada(porValor, "valor");

    const porProcesso = l.processo ? doOrgao.filter((x) => x.c.processo === l.processo && semelhanca(minhas, x.p) >= 0.3) : [];
    if (porProcesso.length) return achada(porProcesso, "processo");

    const porObjeto = comPalavras.filter(
      (x) =>
        semelhanca(minhas, x.p) >= 0.6 &&
        !!x.c.valorEstimado &&
        Math.abs(x.c.valorEstimado / (l.valorEstimado || 1) - 1) <= 0.25 &&
        (!l.dataAbertura || (x.c.publicadoEm && diasEntre(x.c.publicadoEm, l.dataAbertura) >= -1 && diasEntre(x.c.publicadoEm, l.dataAbertura) <= 120)),
    );
    if (porObjeto.length) return achada(porObjeto, "objeto");
    return { estado: "nao-achada" };
  };
}
