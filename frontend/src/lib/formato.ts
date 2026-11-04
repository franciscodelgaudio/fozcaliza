import type { Tipo } from "./tce/temas";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moedaCurta = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const inteiro = new Intl.NumberFormat("pt-BR");

export const formatarMoeda = (v: number) => moeda.format(v);
export const formatarMoedaCurta = (v: number) => moedaCurta.format(v);
export const formatarInteiro = (v: number) => inteiro.format(v);

export function formatarData(v: string | undefined): string {
  if (!v) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

export function formatarDoc(v: string | undefined): string {
  if (!v) return "";
  if (/^\d{14}$/.test(v)) return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return v;
}

export function formatar(v: string | undefined, tipo: Tipo = "texto"): string {
  if (v === undefined || v === "") return "";
  switch (tipo) {
    case "moeda":
      return Number.isFinite(Number(v)) ? moeda.format(Number(v)) : v;
    case "numero":
      return Number.isFinite(Number(v)) ? num.format(Number(v)) : v;
    case "data":
      return formatarData(v);
    case "doc":
      return formatarDoc(v);
    default:
      return v;
  }
}

/** Tipo provável de um atributo pelo prefixo de nome usado no SIM-AM. */
export function tipoPorNome(campo: string): Tipo {
  if (/^vl/i.test(campo)) return "moeda";
  if (/^(dt|Data)/.test(campo)) return "data";
  if (/^nrDoc|^docCredor|^nrDocumento$/.test(campo)) return "doc";
  return "texto";
}

export function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
