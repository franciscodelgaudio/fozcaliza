// Fonte e data de atualização de cada número (regra 1: "cada número tem fonte e data").

import { fonte } from "@/lib/tce/dados";
import { baseCnpj } from "./fornecedores";

export type FonteDado = { nome: string; url?: string; atualizado_em: string | null; detalhe?: string };

export async function fontesLicitacoes(ano: number): Promise<FonteDado[]> {
  const [f, cnpj] = await Promise.all([fonte(ano), baseCnpj()]);
  const lic = f?.temas.Licitacao;
  return [
    {
      nome: "TCE-PR — Portal Informação para Todos",
      url: f?.pagina ?? "https://pit.tce.pr.gov.br/Dados/DadosConsulta/Consolidado",
      atualizado_em: lic ? new Date(lic.lastModified).toISOString().slice(0, 10) : null,
      detalhe: "Dados declarados pelas próprias entidades ao SIM-AM; podem mudar.",
    },
    {
      nome: "Receita Federal — CNPJ",
      url: "https://minhareceita.org",
      atualizado_em: cnpj.atualizado_em ?? null,
      detalhe: "Município e data de abertura do fornecedor.",
    },
  ];
}
