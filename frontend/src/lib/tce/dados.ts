// Leitura direta dos XML do TCE-PR gravados em dados/tce/<ano>/ (ver
// scripts/baixar-tce.mjs). Sem banco: cada arquivo é lido e convertido em
// registros uma vez por processo e fica em memória.
//
// Os XML do "Download de Dados" têm uma estrutura fixa: <root> com um elemento
// vazio por registro e todos os dados em atributos. Por isso o parse é feito
// com uma expressão regular, bem mais rápido que um parser genérico.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export type Registro = Record<string, string>;

export const PASTA_DADOS = process.env.TCE_DADOS ?? join(process.cwd(), "..", "dados", "tce");
export const MUNICIPIO_IBGE6 = "410830";

/** Campos de controle da geração do arquivo, iguais em todos os registros. */
export const CAMPOS_CONTROLE = new Set(["DataReferencia", "ultimoEnvioSIMAMNesteExercicio", "DataEnvioParaTCE"]);

export type FonteAno = {
  fonte: string;
  pagina: string;
  ano: number;
  temas: Record<string, { url: string; lastModified: string; arquivos: Record<string, { bytes: number; sha256: string }> }>;
};

const ENTIDADES_XML: Record<string, string> = { quot: '"', amp: "&", lt: "<", gt: ">", apos: "'" };

function decodificar(v: string): string {
  if (!v.includes("&")) return v.trim();
  return v
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTIDADES_XML[e] ?? m;
    })
    .trim();
}

function parse(xml: string): Registro[] {
  const registros: Registro[] = [];
  const elemento = /<(\w+) ([^>]*?)\/>/g;
  const atributo = /(\w+)="([^"]*)"/g;
  for (const m of xml.matchAll(elemento)) {
    const r: Registro = {};
    for (const a of m[2].matchAll(atributo)) r[a[1]] = decodificar(a[2]);
    registros.push(r);
  }
  return registros;
}

/** Decodifica o XML pelo BOM: UTF-16 LE/BE ou UTF-8. */
export function texto(b: Buffer): string {
  if (b[0] === 0xff && b[1] === 0xfe) return b.toString("utf16le", 2);
  if (b[0] === 0xfe && b[1] === 0xff) return Buffer.from(b.subarray(2)).swap16().toString("utf16le");
  return b.toString("utf8", b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0);
}

const cache = new Map<string, Promise<Registro[]>>();

/** Recorte de obras de anos anteriores (dados/tce-obras/<ano>, ver scripts/baixar-tce.mjs --obras). */
export const PASTA_OBRAS = process.env.TCE_OBRAS ?? join(PASTA_DADOS, "..", "tce-obras");

/** Registros de um XML, pelo nome do tema no arquivo (ex.: "Empenho"). Arquivo ausente = lista vazia. */
export function registros(ano: number, nome: string, pasta: string = PASTA_DADOS): Promise<Registro[]> {
  const chave = `${pasta}|${ano}/${nome}`;
  let p = cache.get(chave);
  if (!p) {
    const caminho = join(pasta, String(ano), `${ano}_${MUNICIPIO_IBGE6}_${nome}.xml`);
    // Arquivos gerados até ~2023 vêm em UTF-16 (BOM FF FE); os mais novos, em UTF-8.
    p = readFile(caminho).then((b) => parse(texto(b)), (erro: NodeJS.ErrnoException) => {
      if (erro.code === "ENOENT") return [];
      throw erro;
    });
    p.catch(() => cache.delete(chave));
    cache.set(chave, p);
  }
  return p;
}

export async function anos(pasta: string = PASTA_DADOS): Promise<number[]> {
  try {
    const nomes = await readdir(pasta);
    return nomes.filter((n) => /^\d{4}$/.test(n)).map(Number).sort((a, b) => b - a);
  } catch {
    return [];
  }
}

export async function fonte(ano: number): Promise<FonteAno | null> {
  try {
    return JSON.parse(await readFile(join(PASTA_DADOS, String(ano), "fonte.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Nomes (sem ano/município/extensão) de todos os XML do ano, com o tema do zip de origem. */
export async function arquivos(ano: number): Promise<{ nome: string; tema: string; bytes: number }[]> {
  const f = await fonte(ano);
  if (!f) return [];
  const prefixo = `${ano}_${MUNICIPIO_IBGE6}_`;
  return Object.entries(f.temas).flatMap(([tema, t]) =>
    Object.entries(t.arquivos).map(([arquivo, info]) => ({
      nome: arquivo.replace(prefixo, "").replace(/\.xml$/i, ""),
      tema,
      bytes: info.bytes,
    })),
  );
}

export const numero = (v: string | undefined) => (v ? Number(v) || 0 : 0);
export const soma = (rs: Registro[], campo: string) => rs.reduce((t, r) => t + numero(r[campo]), 0);

/** Agrupa registros por um campo (ex.: pagamentos por idEmpenho). */
export function agrupar(rs: Registro[], campo: string): Map<string, Registro[]> {
  const m = new Map<string, Registro[]>();
  for (const r of rs) {
    const k = r[campo];
    if (!k) continue;
    const lista = m.get(k);
    if (lista) lista.push(r);
    else m.set(k, [r]);
  }
  return m;
}
