"use client";

// Navegação principal: a seção atual fica em verde, sublinhada (aria-current).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

// usePathname só existe em tempo de execução: o prerender usa a nav sem destaque
// e o item ativo entra assim que a página hidrata.
export function NavPrincipal() {
  return (
    <Suspense fallback={<Nav ativa={false} />}>
      <NavComRota />
    </Suspense>
  );
}

function NavComRota() {
  return <Nav ativa={usePathname().startsWith("/licitacoes")} />;
}

function Nav({ ativa }: { ativa: boolean }) {
  return (
    <nav aria-label="Seções" className="order-last flex basis-full flex-wrap gap-x-6 gap-y-1 text-[15px] font-medium sm:order-none sm:flex-1 sm:basis-auto">
      <Link
        href="/licitacoes"
        aria-current={ativa ? "page" : undefined}
        className={`inline-flex min-h-11 items-center border-b-[3px] ${
          ativa ? "border-verde-700 text-verde-700" : "border-transparent text-cinza-600 hover:text-tinta"
        }`}
      >
        Licitações e obras
      </Link>
      <span className="inline-flex min-h-11 items-center border-b-[3px] border-transparent text-cinza-600" title="Em preparação">
        Saúde <span className="ml-1.5 text-[13px]">(em breve)</span>
      </span>
    </nav>
  );
}
