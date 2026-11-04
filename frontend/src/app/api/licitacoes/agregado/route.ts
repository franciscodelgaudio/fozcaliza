import type { NextRequest } from "next/server";
import { porCidade, porOrigem, resumo } from "@/lib/licitacoes/agregados";
import { baseCnpj } from "@/lib/licitacoes/fornecedores";
import { entidadesDe, filtrarEntidade, licitacoes } from "@/lib/licitacoes/modelo";
import { anos, fonte } from "@/lib/tce/dados";

// GET /api/licitacoes/agregado?por=origem|cidade&ano=2026&entidade=prefeitura|saude|…|todas
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const disponiveis = await anos();
  const ano = Number(sp.get("ano")) || disponiveis[0];
  if (!disponiveis.includes(ano)) return Response.json({ erro: `ano ${ano} não disponível`, anos: disponiveis }, { status: 404 });

  return Response.json(await agregado(ano, sp.get("entidade") ?? undefined, sp.get("por") ?? "origem"));
}

/** Em cache por ano, entidade e agrupamento. */
async function agregado(ano: number, entidade: string | undefined, por: string) {
  "use cache";
  const todas = await licitacoes(ano);
  const ls = filtrarEntidade(todas, entidade);
  const [f, cnpj] = await Promise.all([fonte(ano), baseCnpj()]);

  return {
    ano,
    entidade: entidade ?? "prefeitura",
    entidades: entidadesDe(todas).map(({ slug, nome, n }) => ({ slug, nome, licitacoes: n })),
    resumo: resumo(ls),
    [por === "cidade" ? "cidades" : "origens"]: por === "cidade" ? porCidade(ls) : porOrigem(ls),
    fonte: [
      { nome: f?.fonte ?? "TCE-PR", pagina: f?.pagina, atualizado_em: f?.temas.Licitacao?.lastModified ?? null },
      { nome: cnpj.fonte, atualizado_em: cnpj.atualizado_em ?? null },
    ],
  };
}
