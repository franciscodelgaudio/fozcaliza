// Totais por origem e por cidade do fornecedor (passos 1 a 3 da história).
// Base: valor homologado (soma dos itens vencidos) de cada licitação.

import { ORIGENS, nomeCidade, type Origem } from "./fornecedores";
import type { Licitacao } from "./modelo";

export type TotalOrigem = { origem: Origem; rotulo: string; valor: number; fracao: number; fornecedores: number };
export type TotalCidade = { cidade: string; municipio: string | null; uf: string | null; origem: Origem; valor: number; licitacoes: number; fornecedores: number };

export function resumo(ls: Licitacao[]) {
  const comVencedor = ls.filter((l) => l.valorHomologado !== null);
  return {
    licitacoes: ls.length,
    licitacoesComVencedor: comVencedor.length,
    valorEstimado: ls.reduce((t, l) => t + l.valorEstimado, 0),
    valorHomologado: comVencedor.reduce((t, l) => t + (l.valorHomologado ?? 0), 0),
    itensComValorPublicadoComoTotal: ls.reduce((t, l) => t + l.itens.filter((i) => i.valorPublicadoComoTotal).length, 0),
    itensDivididos: ls.reduce((t, l) => t + l.itens.filter((i) => i.divididoEntre > 1).length, 0),
  };
}

export function porOrigem(ls: Licitacao[]): TotalOrigem[] {
  const valor = new Map<Origem, number>();
  const docs = new Map<Origem, Set<string>>();
  for (const l of ls)
    for (const v of l.vencedores) {
      valor.set(v.origem, (valor.get(v.origem) ?? 0) + v.valor);
      if (!docs.has(v.origem)) docs.set(v.origem, new Set());
      docs.get(v.origem)!.add(v.doc);
    }
  const total = [...valor.values()].reduce((a, b) => a + b, 0);
  // "Sem informação" aparece sempre, mesmo zerado (seção 9.1).
  return ORIGENS.map(({ id, rotulo }) => ({
    origem: id,
    rotulo,
    valor: valor.get(id) ?? 0,
    fracao: total ? (valor.get(id) ?? 0) / total : 0,
    fornecedores: docs.get(id)?.size ?? 0,
  }));
}

export function porCidade(ls: Licitacao[]): TotalCidade[] {
  const m = new Map<string, TotalCidade & { _lic: Set<string>; _docs: Set<string> }>();
  for (const l of ls)
    for (const v of l.vencedores) {
      const chave = v.origem === "sem-informacao" ? "sem-informacao" : `${v.municipio}|${v.uf}`;
      let c = m.get(chave);
      if (!c) {
        c = {
          cidade: v.origem === "sem-informacao" ? "Sem informação" : nomeCidade(v.municipio, v.uf),
          municipio: v.origem === "sem-informacao" ? null : v.municipio,
          uf: v.origem === "sem-informacao" ? null : v.uf,
          origem: v.origem,
          valor: 0,
          licitacoes: 0,
          fornecedores: 0,
          _lic: new Set(),
          _docs: new Set(),
        };
        m.set(chave, c);
      }
      c.valor += v.valor;
      c._lic.add(l.id);
      c._docs.add(v.doc);
    }
  return [...m.values()]
    .map(({ _lic, _docs, ...c }) => ({ ...c, licitacoes: _lic.size, fornecedores: _docs.size }))
    .sort((a, b) => b.valor - a.valor);
}
