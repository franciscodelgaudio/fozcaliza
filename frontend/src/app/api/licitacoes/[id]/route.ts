import type { NextRequest } from "next/server";
import { publica } from "@/lib/licitacoes/consulta";
import { fontesLicitacoes } from "@/lib/licitacoes/fontes";
import { licitacaoPorId } from "@/lib/licitacoes/modelo";

// GET /api/licitacoes/{id} — ficha completa (sem sinais e sem preços nesta fase).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/licitacoes/[id]">) {
  const { id } = await ctx.params;
  const l = await licitacaoPorId(id);
  if (!l) return Response.json({ erro: "licitação não encontrada" }, { status: 404 });
  return Response.json({ ...publica(l), fonte: await fontesLicitacoes(l.ano), origem_tce: l.fonte });
}
