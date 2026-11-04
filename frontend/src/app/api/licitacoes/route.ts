import type { NextRequest } from "next/server";
import { consultarLicitacoes, lerParametrosLicitacoes, opcoes, resumoLista, type ParametrosLicitacoes } from "@/lib/licitacoes/consulta";
import { fontesLicitacoes } from "@/lib/licitacoes/fontes";
import { licitacoes } from "@/lib/licitacoes/modelo";
import { anos } from "@/lib/tce/dados";

// GET /api/licitacoes?q&modalidade&gestao&cidade&uf&entidade&ordem&pagina&ano
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const disponiveis = await anos();
  const ano = Number(sp.get("ano")) || disponiveis[0];
  if (!disponiveis.includes(ano)) return Response.json({ erro: `ano ${ano} não disponível`, anos: disponiveis }, { status: 404 });

  return Response.json(await consulta(ano, lerParametrosLicitacoes(sp)));
}

/** Em cache por ano e filtros. */
async function consulta(ano: number, p: ParametrosLicitacoes) {
  "use cache";
  const todas = await licitacoes(ano);
  const r = consultarLicitacoes(todas, p);
  return {
    ano,
    parametros: p,
    total: r.total,
    valor_total: r.valorHomologado,
    sem_vencedor: r.semVencedor,
    pagina: r.pagina,
    paginas: r.paginas,
    itens: r.itens.map(resumoLista),
    opcoes: opcoes(todas, p.entidade),
    fonte: await fontesLicitacoes(ano),
  };
}
