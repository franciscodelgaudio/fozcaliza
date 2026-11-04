// Mandatos do Executivo municipal, para rótulos e filtros (seção 7 da especificação).
// Atenção: datas de afastamento e posse de interinos ainda precisam ser
// conferidas (pendência 6); o filtro usa só os limites de cada mandato.

export type Gestao = {
  rotulo: string;
  inicio: string;
  fim: string | null;
  prefeito: string;
  partido: string;
  observacao?: string;
};

export const GESTOES: Gestao[] = [
  { rotulo: "2009-2012", inicio: "2009-01-01", fim: "2012-12-31", prefeito: "Paulo Mac Donald Ghisi", partido: "PDT" },
  {
    rotulo: "2013-2016",
    inicio: "2013-01-01",
    fim: "2016-12-31",
    prefeito: "Reni Pereira",
    partido: "PSB",
    observacao: "Afastado em 2016; Ivone Barofaldi (PSDB) assumiu como prefeita em exercício.",
  },
  {
    rotulo: "2017-2020",
    inicio: "2017-01-01",
    fim: "2020-12-31",
    prefeito: "Chico Brasileiro",
    partido: "PSD",
    observacao: "Eleito em eleição suplementar (abr/2017); Inês da Saúde (PSD) interina de jan a abr/2017.",
  },
  { rotulo: "2021-2024", inicio: "2021-01-01", fim: "2024-12-31", prefeito: "Chico Brasileiro", partido: "PSD" },
  { rotulo: "2025-atual", inicio: "2025-01-01", fim: null, prefeito: "General Silva e Luna", partido: "PL" },
];

/** Gestão pela data (AAAA-MM-DD…). Data ausente ou fora da tabela = null. */
export function gestaoDe(data: string | undefined): string | null {
  if (!data) return null;
  const d = data.slice(0, 10);
  for (const g of GESTOES) if (d >= g.inicio && (g.fim === null || d <= g.fim)) return g.rotulo;
  return null;
}

export const rotuloGestao = (r: string) => r.replace("-", "–");
