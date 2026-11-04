// Fornecedores pela base pública da Receita Federal, gravada por
// scripts/consultar-cnpj.mjs em dados/cnpj/cnpj.json. Daqui sai a origem do
// fornecedor (seção 9.1): Foz, outras cidades do PR, outros estados ou sem informação.

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export const IBGE_FOZ = 4108304;
const DADOS = process.env.DADOS ?? join(process.cwd(), "..", "dados");
const ARQUIVO = join(DADOS, "cnpj", "cnpj.json");
const ARQUIVO_MUNICIPIOS = join(DADOS, "ibge", "municipios.json");

export type RegistroCnpj = {
  razao_social?: string | null;
  municipio?: string | null;
  uf?: string | null;
  codigo_municipio_ibge?: number | null;
  data_abertura?: string | null;
  cnae_principal?: number | null;
  cnae_descricao?: string | null;
  situacao?: string | null;
  fonte?: string;
  consultado_em?: string;
  nao_encontrado?: boolean;
  invalido?: boolean;
  erro?: string;
};

export type BaseCnpj = {
  fonte: string;
  atualizado_em?: string;
  cnpjs: Record<string, RegistroCnpj>;
  /** Nome oficial dos municípios (IBGE), pelo código. */
  municipios: Record<string, { nome: string; uf: string }>;
};

export type Origem = "foz" | "pr" | "fora" | "sem-informacao";

export const ORIGENS: { id: Origem; rotulo: string }[] = [
  { id: "foz", rotulo: "Foz do Iguaçu" },
  { id: "pr", rotulo: "Outras cidades do PR" },
  { id: "fora", rotulo: "Outros estados" },
  { id: "sem-informacao", rotulo: "Sem informação" },
];

export type Fornecedor = {
  doc: string;
  tipoDoc: "CNPJ" | "CPF" | "outro";
  nome: string;
  origem: Origem;
  /** Nome oficial do município (IBGE); se faltar, o da Receita, sem acentos. */
  municipio: string | null;
  uf: string | null;
  dataAbertura: string | null;
  /** Por que a origem é "sem informação", quando for. */
  motivoSemInformacao?: string;
};

let base: { versao: string; dados: Promise<BaseCnpj> } | null = null;

async function lerJson<T>(caminho: string, padrao: T): Promise<T> {
  try {
    return JSON.parse(await readFile(caminho, "utf8")) as T;
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === "ENOENT") return padrao;
    throw erro;
  }
}

const mtime = (caminho: string) => stat(caminho).then((s) => s.mtimeMs, () => 0);

/** Base de CNPJs em memória; relida quando um dos arquivos muda no disco. */
export async function baseCnpj(): Promise<BaseCnpj> {
  const versao = (await Promise.all([mtime(ARQUIVO), mtime(ARQUIVO_MUNICIPIOS)])).join("|");
  if (base?.versao !== versao) {
    const dados = Promise.all([
      lerJson<Omit<BaseCnpj, "municipios">>(ARQUIVO, { fonte: "Receita Federal — CNPJ", cnpjs: {} }),
      lerJson<{ municipios: BaseCnpj["municipios"] }>(ARQUIVO_MUNICIPIOS, { municipios: {} }),
    ]).then(([c, m]) => ({ ...c, municipios: m.municipios }));
    dados.catch(() => (base = null));
    base = { versao, dados };
  }
  return base.dados;
}

/** Monta o fornecedor a partir do documento publicado no TCE-PR e da base da Receita. */
export function fornecedor(docBruto: string | undefined, nomeTce: string | undefined, b: BaseCnpj): Fornecedor {
  const doc = (docBruto ?? "").replace(/\D/g, "");
  const nome = (nomeTce ?? "").trim();
  if (doc.length !== 14) {
    // O TCE-PR publica CPF mascarado ("***.531.***-**"): pessoa física, sem endereço.
    const cpf = doc.length === 11 || /^\*{3}\.\d{3}\.\*{3}-\*{2}$/.test((docBruto ?? "").trim());
    return {
      doc: cpf && doc.length !== 11 ? (docBruto ?? "").trim() : doc,
      tipoDoc: cpf ? "CPF" : "outro",
      nome,
      origem: "sem-informacao",
      municipio: null,
      uf: null,
      dataAbertura: null,
      motivoSemInformacao: cpf ? "pessoa física (CPF)" : "documento ausente ou inválido",
    };
  }
  const r = b.cnpjs[doc];
  const semInfo = (motivo: string): Fornecedor => ({
    doc,
    tipoDoc: "CNPJ",
    nome: r?.razao_social || nome,
    origem: "sem-informacao",
    municipio: r?.municipio ?? null,
    uf: r?.uf ?? null,
    dataAbertura: r?.data_abertura ?? null,
    motivoSemInformacao: motivo,
  });
  if (!r) return semInfo("CNPJ ainda não consultado na Receita");
  if (r.invalido) return semInfo("CNPJ inválido");
  if (r.nao_encontrado) return semInfo("CNPJ não encontrado na Receita");
  if (r.erro && !r.uf) return semInfo("falha na consulta à Receita");
  if (!r.uf) return semInfo("CNPJ sem endereço na Receita");

  const origem: Origem = r.codigo_municipio_ibge === IBGE_FOZ ? "foz" : r.uf === "PR" ? "pr" : "fora";
  return {
    doc,
    tipoDoc: "CNPJ",
    nome: r.razao_social || nome,
    origem,
    municipio: (r.codigo_municipio_ibge && b.municipios[r.codigo_municipio_ibge]?.nome) || r.municipio || null,
    uf: r.uf,
    dataAbertura: r.data_abertura ?? null,
  };
}

export const nomeCidade = (municipio: string | null, uf: string | null) =>
  municipio ? (uf ? `${municipio} (${uf})` : municipio) : "sem informação";
