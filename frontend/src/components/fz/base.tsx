// Componentes visuais básicos do Fozcaliza (seção 3.5 da especificação).

import Link from "next/link";
import type { ReactNode } from "react";

/** Faixas branco + verde abaixo do topo, como na bandeira de Foz do Iguaçu. */
export function FlagStripe() {
  return (
    <div aria-hidden="true">
      <div className="h-2 bg-white" />
      <div className="h-2 bg-verde-700" />
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="bg-verde-900 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="inline-flex min-h-11 items-center text-xl font-semibold tracking-tight">
          Foz<span className="font-extrabold">caliza</span>
        </Link>
        <nav aria-label="Seções" className="order-last flex basis-full flex-wrap items-center gap-1 text-[15px] sm:order-none sm:basis-auto sm:flex-1">
          <Link href="/licitacoes" className="-ml-3 inline-flex min-h-11 items-center rounded-[10px] px-3 hover:bg-white/10 sm:ml-0">
            Licitações e obras
          </Link>
          <span className="inline-flex min-h-11 items-center px-3 text-white/70" title="Em preparação">
            Saúde <span className="ml-1.5 text-[13px]">(em breve)</span>
          </span>
        </nav>
        <Link
          href="/licitacoes/explorar"
          className="ml-auto inline-flex min-h-11 items-center rounded-[10px] bg-white px-4 text-[15px] font-semibold text-verde-900 hover:bg-verde-100 sm:ml-0"
        >
          Explorar os dados
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-12 bg-verde-900 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-[14px] text-white/85">
        <p>
          Fozcaliza é feito com dados públicos: <strong className="text-white">TCE-PR</strong> (Portal Informação para Todos),{" "}
          <strong className="text-white">Receita Federal</strong> (CNPJ) e <strong className="text-white">IBGE</strong>.
        </p>
        <p>
          <Link href="/" className="underline underline-offset-2 hover:text-white">
            Dados brutos do TCE-PR
          </Link>
        </p>
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
  return exemplo ? <Pill tom="exemplo">Exemplo · dados fictícios</Pill> : <Pill tom="real">Dado real · {fonte}</Pill>;
}

/** Rótulo em caixa alta (13 px, espaçado). */
export function Rotulo({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[13px] font-semibold tracking-[.07em] text-cinza-600 uppercase ${className}`}>{children}</p>;
}
