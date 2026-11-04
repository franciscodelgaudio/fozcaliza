// Sinais de risco de uma licitação, inspirados nos indicadores de "red flags" de compras
// públicas do FMI (2022). Um sinal mostra onde vale perguntar; não prova irregularidade.
//
// Cada sinal tem três estados além de "não se aplica": presente, ausente ou sem
// informação. Dado faltante nunca vira "ausente" nem "presente" (ver
// docs/licitacoes/inspecao-dados.md, pendência 1). Regras detalhadas na metodologia.

import { licitacoes, MODALIDADES_COMPETITIVAS, type Licitacao } from "./modelo";

export type EstadoSinal = "presente" | "ausente" | "sem-informacao" | "nao-se-aplica";

export type DefinicaoSinal = { id: number; titulo: string; explicacao: string; regra: string };

export const SINAIS: DefinicaoSinal[] = [
  {
    id: 1,
    titulo: "Só uma empresa disputou",
    explicacao: "mercado pequeno ou produto muito específico.",
    regra: "Pregão ou concorrência com um único participante (CNPJ/CPF distinto) publicado no TCE-PR.",
  },
  {
    id: 2,
    titulo: "Contratou sem licitar",
    explicacao: "emergência, fornecedor exclusivo, valor pequeno.",
    regra: "Dispensa ou inexigibilidade.",
  },
  {
    id: 3,
    titulo: "Edital fora do portal nacional",
    explicacao: "atraso no envio ao PNCP ou número de processo informado diferente.",
    regra:
      "Pregão ou concorrência que não aparece no PNCP pelo número do processo, ou que só foi publicada lá depois da abertura das propostas. Sem número de processo, ou com mais de uma compra com o mesmo número, fica sem informação.",
  },
  {
    id: 4,
    titulo: "Prazo curto para propostas",
    explicacao: "urgência real e documentada.",
    regra: "Pregão ou concorrência com menos de 8 dias úteis entre o edital e a abertura (o menor prazo da Lei 14.133, art. 55).",
  },
  {
    id: 5,
    titulo: "Decisão rápida ou lenta demais",
    explicacao: "compras simples se resolvem rápido; recursos atrasam.",
    regra: "Tempo entre a abertura e a homologação entre os 10% mais curtos ou os 10% mais longos dos pregões e concorrências do ano.",
  },
  {
    id: 6,
    titulo: "Dinheiro concentrado num fornecedor",
    explicacao: "alguns serviços têm poucos fornecedores capazes.",
    regra: "Um vencedor ficou com 25% ou mais de tudo o que a mesma secretaria contratou no ano (secretarias com ao menos 5 licitações com vencedor).",
  },
  {
    id: 7,
    titulo: "Empresa recém-aberta venceu",
    explicacao: "empresas novas também podem ser legítimas.",
    regra: "Um vencedor com CNPJ aberto menos de 12 meses antes da abertura da licitação.",
  },
];

export type ResultadoSinais = {
  estados: EstadoSinal[];
  presentes: number;
  /** Sinais que puderam ser avaliados (presente ou ausente). */
  avaliados: number;
};

const DIA = 86_400_000;
const dataUtc = (s: string) => Date.parse(`${s}T00:00:00Z`);

/** Dias úteis (seg–sex) a partir do dia seguinte a `de` até `ate`, inclusive. Feriados não são descontados. */
export function diasUteis(de: string, ate: string): number {
  let n = 0;
  for (let t = dataUtc(de) + DIA, fim = dataUtc(ate); t <= fim; t += DIA) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) n++;
  }
  return n;
}

const dias = (de: string, ate: string) => Math.round((dataUtc(ate) - dataUtc(de)) / DIA);

function percentil(ordenados: number[], p: number) {
  if (!ordenados.length) return NaN;
  const i = (ordenados.length - 1) * p;
  const a = Math.floor(i);
  const b = Math.ceil(i);
  return ordenados[a] + (ordenados[b] - ordenados[a]) * (i - a);
}

const PRAZO_MINIMO_DIAS_UTEIS = 8;
/** Licitação com processo informado e ausente do PNCP conta como sinal (ver validação na metodologia). */
const NAO_ACHADA_E_SINAL = true;
const MESES_EMPRESA_NOVA = 12;
const FATIA_CONCENTRACAO = 0.25;
const MIN_LICITACOES_SECRETARIA = 5;

function mesesEntre(a: string, b: string) {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma) - (db < da ? 1 : 0);
}

const cache = new WeakMap<Licitacao[], Map<string, ResultadoSinais>>();

/** Sinais de todas as licitações do conjunto (o conjunto define percentis e concentração). */
export function sinaisDe(todas: Licitacao[]): Map<string, ResultadoSinais> {
  const pronto = cache.get(todas);
  if (pronto) return pronto;

  const competitiva = (l: Licitacao) => MODALIDADES_COMPETITIVAS.has(l.modalidade);

  // Sinal 5: limites pelos percentis do próprio ano.
  const duracoes = todas
    .filter((l) => competitiva(l) && l.dataAbertura && l.dataHomologacao)
    .map((l) => dias(l.dataAbertura!, l.dataHomologacao!))
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);
  const curto = percentil(duracoes, 0.1);
  const longo = percentil(duracoes, 0.9);
  const temDuracoes = duracoes.length >= 10;

  // Sinal 6: valor de cada fornecedor dentro de cada secretaria (por entidade).
  const grupo = (l: Licitacao) => `${l.entidade.id}|${l.secretaria!.nome}`;
  const totalGrupo = new Map<string, number>();
  const licGrupo = new Map<string, number>();
  const fornGrupo = new Map<string, number>();
  for (const l of todas) {
    if (!l.secretaria || l.valorHomologado === null) continue;
    const g = grupo(l);
    licGrupo.set(g, (licGrupo.get(g) ?? 0) + 1);
    for (const v of l.vencedores) {
      totalGrupo.set(g, (totalGrupo.get(g) ?? 0) + v.valor);
      const k = `${g}|${v.doc}`;
      fornGrupo.set(k, (fornGrupo.get(k) ?? 0) + v.valor);
    }
  }

  const r = new Map<string, ResultadoSinais>();
  for (const l of todas) {
    const comp = competitiva(l);
    const semLicitar = l.modalidade === "Dispensa" || l.modalidade === "Inexigibilidade";

    const s1: EstadoSinal = !comp ? "nao-se-aplica" : l.participantes === null ? "sem-informacao" : l.participantes === 1 ? "presente" : "ausente";
    const s2: EstadoSinal = semLicitar ? "presente" : "ausente";
    let s3: EstadoSinal = "nao-se-aplica";
    if (comp) {
      const p = l.pncp;
      if (p.estado === "achada")
        s3 = p.compra.publicadoEm && l.dataAbertura ? (p.compra.publicadoEm > l.dataAbertura ? "presente" : "ausente") : "ausente";
      else s3 = p.estado === "nao-achada" && NAO_ACHADA_E_SINAL ? "presente" : "sem-informacao";
    }

    let s4: EstadoSinal = "nao-se-aplica";
    if (comp)
      s4 =
        l.dataEdital && l.dataAbertura && l.dataAbertura >= l.dataEdital
          ? diasUteis(l.dataEdital, l.dataAbertura) < PRAZO_MINIMO_DIAS_UTEIS
            ? "presente"
            : "ausente"
          : "sem-informacao";

    let s5: EstadoSinal = "nao-se-aplica";
    if (comp) {
      if (!temDuracoes || !l.dataAbertura || !l.dataHomologacao) s5 = "sem-informacao";
      else {
        const d = dias(l.dataAbertura, l.dataHomologacao);
        s5 = d < 0 ? "sem-informacao" : d < curto || d > longo ? "presente" : "ausente";
      }
    }

    let s6: EstadoSinal = "sem-informacao";
    if (l.valorHomologado === null || !l.vencedores.length) s6 = "nao-se-aplica";
    else if (l.secretaria) {
      const g = grupo(l);
      const total = totalGrupo.get(g) ?? 0;
      if ((licGrupo.get(g) ?? 0) >= MIN_LICITACOES_SECRETARIA && total > 0)
        s6 = l.vencedores.some((v) => (fornGrupo.get(`${g}|${v.doc}`) ?? 0) / total >= FATIA_CONCENTRACAO) ? "presente" : "ausente";
    }

    let s7: EstadoSinal = "nao-se-aplica";
    const cnpjs = l.vencedores.filter((v) => v.tipoDoc === "CNPJ");
    if (cnpjs.length && l.dataAbertura) {
      const idades = cnpjs.map((v) => (v.dataAbertura ? mesesEntre(v.dataAbertura, l.dataAbertura!) : null));
      s7 = idades.some((m) => m !== null && m < MESES_EMPRESA_NOVA)
        ? "presente"
        : idades.every((m) => m !== null)
          ? "ausente"
          : "sem-informacao";
    } else if (cnpjs.length) s7 = "sem-informacao";

    const estados = [s1, s2, s3, s4, s5, s6, s7];
    r.set(l.id, {
      estados,
      presentes: estados.filter((e) => e === "presente").length,
      avaliados: estados.filter((e) => e === "presente" || e === "ausente").length,
    });
  }
  cache.set(todas, r);
  return r;
}

/** Sinais de uma licitação, calculados sobre todas as licitações do mesmo ano. */
export async function sinaisDaLicitacao(l: Licitacao): Promise<ResultadoSinais | null> {
  return sinaisDe(await licitacoes(l.ano)).get(l.id) ?? null;
}

/** Formato público (API): cada sinal com título e estado. */
export const sinaisPublicos = (r: ResultadoSinais) => ({
  presentes: r.presentes,
  avaliados: r.avaliados,
  lista: SINAIS.map((d, i) => ({ id: d.id, titulo: d.titulo, estado: r.estados[i] })),
});
