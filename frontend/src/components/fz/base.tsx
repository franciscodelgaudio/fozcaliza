// Componentes visuais básicos do Fozcaliza (seção 3.5 da especificação).

import Link from "next/link";
import type { ReactNode } from "react";
import { NavPrincipal } from "./nav";

/** Largura e respiro padrão do conteúdo. */
export function Container({ children, className = "", largo = false }: { children: ReactNode; className?: string; largo?: boolean }) {
  return <div className={`mx-auto w-full ${largo ? "max-w-[1240px]" : "max-w-[1200px]"} px-4 sm:px-6 ${className}`}>{children}</div>;
}

/** Faixas branco + verde, como na bandeira de Foz do Iguaçu (abaixo de blocos verde-escuros). */
export function FlagStripe() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-1.5 pb-1.5">
      <div className="h-1.5 bg-white" />
      <div className="h-1.5 bg-verde-700" />
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b border-linha bg-white">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-8 gap-y-2 px-4 py-4 sm:px-6">
        <Link href="/" className="inline-flex min-h-11 items-center text-[22px] font-extrabold tracking-[-0.02em] text-tinta">
          Foz<span className="text-verde-700">caliza</span>
        </Link>
        <NavPrincipal />
        <Link
          href="/licitacoes/explorar"
          className="ml-auto inline-flex min-h-11 items-center rounded-[10px] border border-verde-700 px-4 text-[15px] font-bold text-verde-700 hover:bg-verde-050 sm:ml-0"
        >
          Explorar os dados
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-[#1c6444] bg-verde-900 text-[#dcefe3]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap justify-between gap-x-8 gap-y-3 px-4 py-8 text-[14px] sm:px-6">
        <p className="max-w-3xl self-center">
          Fontes: TCE-PR (Portal Informação para Todos), Receita Federal (CNPJ) e IBGE. Dados declarados pelas próprias entidades; podem
          mudar.
        </p>
        <div className="flex flex-wrap gap-x-6">
          <Link href="/licitacoes/metodologia" className="inline-flex min-h-11 items-center text-white underline underline-offset-2">
            Como calculamos
          </Link>
          <Link href="/licitacoes/explorar" className="inline-flex min-h-11 items-center text-white underline underline-offset-2">
            Explorar os dados
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center text-white underline underline-offset-2">
            Dados brutos do TCE-PR
          </Link>
        </div>
      </div>
    </footer>
  );
}

export type Tom = "bom" | "alerta" | "neutro" | "exemplo" | "real";

const TONS: Record<Tom, string> = {
  bom: "bg-verde-100 text-verde-800",
  alerta: "bg-alerta-100 text-alerta-800",
  neutro: "bg-cinza-100 text-cinza-700",
  exemplo: "bg-exemplo text-exemplo-texto",
  real: "bg-verde-050 text-verde-800 border border-verde-borda",
};

/** Pílula de status. A cor nunca é a única informação: o texto sempre diz o que é. */
export function Pill({ tom = "neutro", children }: { tom?: Tom; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[13px] font-semibold ${TONS[tom]}`}>{children}</span>
  );
}

/** Selo "Dado real · fonte" ou "Exemplo · dados fictícios". */
export function SourceBadge({ fonte, exemplo = false }: { fonte?: string; exemplo?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1.5 text-[12px] font-extrabold tracking-[0.08em] uppercase ${
        exemplo ? "bg-exemplo text-exemplo-texto" : "bg-verde-100 text-verde-800"
      }`}
    >
      {exemplo ? "Exemplo · dados fictícios" : `Dado real · ${fonte}`}
    </span>
  );
}

/** Rótulo em caixa alta (13 px, espaçado). */
export function Rotulo({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[13px] font-semibold tracking-[.07em] text-cinza-600 uppercase ${className}`}>{children}</p>;
}
