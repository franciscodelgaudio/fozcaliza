import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FichaLicitacao } from "@/components/fz/licitacoes";
import { publica } from "@/lib/licitacoes/consulta";
import { fontesLicitacoes } from "@/lib/licitacoes/fontes";
import { licitacaoPorId } from "@/lib/licitacoes/modelo";

export async function generateMetadata({ params }: PageProps<"/licitacoes/[id]">): Promise<Metadata> {
  const l = await licitacaoPorId((await params).id);
  return { title: l ? `${l.modalidade} ${l.numero}` : "Licitação" };
}

export default function Page(props: PageProps<"/licitacoes/[id]">) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link href="/licitacoes/explorar" className="inline-flex min-h-11 w-fit items-center text-[15px] text-verde-700 underline underline-offset-2">
        ← Voltar para o explorador
      </Link>
      <Suspense fallback={<p className="py-10 text-cinza-600">Lendo os dados do TCE-PR…</p>}>
        <Ficha {...props} />
      </Suspense>
    </div>
  );
}

async function Ficha({ params }: PageProps<"/licitacoes/[id]">) {
  const l = await licitacaoPorId((await params).id);
  if (!l) notFound();
  return <FichaLicitacao l={publica(l)} fontes={await fontesLicitacoes(l.ano)} titulo="h1" />;
}
