import type { NextRequest } from "next/server";
import { publica } from "@/lib/licitacoes/consulta";
import { fontesLicitacoes } from "@/lib/licitacoes/fontes";
import { licitacaoPorId } from "@/lib/licitacoes/modelo";
import { sinaisDaLicitacao, sinaisPublicos } from "@/lib/licitacoes/sinais";

// GET /api/licitacoes/{id} — ficha completa com sinais de risco (sem preços nesta fase).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/licitacoes/[id]">) {
  const ficha = await fichaPorId((await ctx.params).id);
  if (!ficha) return Response.json({ erro: "licitação não encontrada" }, { status: 404 });
  return Response.json(ficha);
}

async function fichaPorId(id: string) {
  "use cache";
  const l = await licitacaoPorId(id);
  if (!l) return null;
  const [fonte, sinais] = await Promise.all([fontesLicitacoes(l.ano), sinaisDaLicitacao(l)]);
  return { ...publica(l), sinais: sinais ? sinaisPublicos(sinais) : null, fonte, origem_tce: l.fonte };
}
