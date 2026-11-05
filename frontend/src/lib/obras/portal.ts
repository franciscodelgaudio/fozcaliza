// Obras do Portal da Transparência da Prefeitura de Foz do Iguaçu, gravadas por
// scripts/baixar-portal-obras.mjs em dados/portal-foz/. É a única fonte oficial com o
// percentual executado de cada obra, o valor pago e o motivo de paralisação, todos
// informados pela própria prefeitura.
//
// Casamento com a obra do TCE-PR: mesma descrição (sem diferença de espaços e caixa)
// e mesmo valor ao centavo; se a descrição divergir, só o valor, quando for único.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizar } from "@/lib/tce/consulta";

export const PASTA_PORTAL = process.env.PORTAL_FOZ_DADOS ?? join(process.cwd(), "..", "dados", "portal-foz");

type Bruto = Record<string, unknown> & { idOxy: string };

export type ObraPortal = {
  idOxy: string;
  ordemServico: string;
  situacao: string;
  /** Percentual executado informado pela prefeitura (0–100). */
  percentual: number | null;
  valorContrato: number | null;
  valorAditivo: number | null;
  valorPago: number | null;
  inicio: string | null;
  previsaoTermino: string | null;
  vigencia: string | null;
  paralisacao: { tipo: string | null; motivo: string | null; data: string | null; previsaoReinicio: string | null } | null;
  empresa: string | null;
  /** Página da obra no portal da prefeitura. */
  url: string;
};

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const numero = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const centavos = (v: unknown) => Math.round(Number(v) * 100);

function converter(o: Bruto): ObraPortal {
  const motivo = texto(o.acompMotivo);
  const tipo = texto(o.tipoParalisacao);
  return {
    idOxy: o.idOxy,
    ordemServico: texto(o.displayOrdemServico) ?? String(o.ordemServico ?? ""),
    situacao: texto(o.situacao) ?? "",
    percentual: numero(o.percentual),
    valorContrato: numero(o.valorContrato),
    valorAditivo: numero(o.valorAditivo),
    valorPago: numero(o.valorPago),
    inicio: texto(o.data)?.slice(0, 10) ?? null,
    previsaoTermino: texto(o.previsaoTermino)?.slice(0, 10) ?? null,
    vigencia: texto(o.vigenciaAtualizada)?.slice(0, 10) ?? null,
    paralisacao:
      motivo || tipo || /paralis/i.test(String(o.situacao))
        ? { tipo, motivo, data: texto(o.acompData)?.slice(0, 10) ?? null, previsaoReinicio: texto(o.acompPrevisaoReinicio)?.slice(0, 10) ?? null }
        : null,
    empresa: texto(o.empresas) ?? texto(o.empresa),
    url: `https://transparencia.foz.pr.gov.br/portaltransparencia/1/obraspublicas/detalhes?idOxy=${o.idOxy}`,
  };
}

let cache: Promise<{ porChave: Map<string, ObraPortal[]>; porValor: Map<number, ObraPortal[]>; atualizadoEm: string | null }> | null = null;

function base() {
  if (!cache) {
    cache = (async () => {
      let brutos: Bruto[] = [];
      let atualizadoEm: string | null = null;
      try {
        brutos = JSON.parse(await readFile(join(PASTA_PORTAL, "obras.json"), "utf8"));
        atualizadoEm = JSON.parse(await readFile(join(PASTA_PORTAL, "fonte.json"), "utf8")).baixado_em?.slice(0, 10) ?? null;
      } catch {
        /* sem dados do portal */
      }
      const porChave = new Map<string, ObraPortal[]>();
      const porValor = new Map<number, ObraPortal[]>();
      for (const b of brutos) {
        const o = converter(b);
        const v = centavos(b.valorIntervencao ?? b.valorContrato);
        const k = `${normalizar(String(b.descricao ?? ""))}|${v}`;
        porChave.set(k, [...(porChave.get(k) ?? []), o]);
        porValor.set(v, [...(porValor.get(v) ?? []), o]);
      }
      return { porChave, porValor, atualizadoEm };
    })();
    cache.catch(() => (cache = null));
  }
  return cache;
}

/** Função que acha a obra do portal correspondente a uma obra do TCE-PR. */
export async function casadorPortal(): Promise<(nome: string, valor: number) => ObraPortal | null> {
  const { porChave, porValor } = await base();
  return (nome, valor) => {
    const v = centavos(valor);
    const exata = porChave.get(`${normalizar(nome)}|${v}`) ?? [];
    if (exata.length === 1) return exata[0];
    const mesmoValor = porValor.get(v) ?? [];
    return mesmoValor.length === 1 ? mesmoValor[0] : null;
  };
}

export async function atualizacaoPortal(): Promise<string | null> {
  return (await base()).atualizadoEm;
}
