import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FichaObra } from "@/components/fz/obras";
import { obras } from "@/lib/obras/modelo";

async function obraPorId(id: string) {
  return (await obras()).find((o) => o.id === id) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/obras/[id]">): Promise<Metadata> {
  const o = await obraPorId((await params).id);
  return { title: o ? o.nome : "Obra" };
}

export default function Page(props: PageProps<"/obras/[id]">) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
      <Link
        href="/licitacoes/explorar?aba=obras"
        className="inline-flex min-h-11 w-fit items-center text-[15px] font-semibold text-verde-700 hover:text-verde-800"
      >
        ← Voltar para as obras
      </Link>
      <Suspense fallback={<p className="py-10 text-cinza-600">Lendo os dados do TCE-PR…</p>}>
        <Ficha {...props} />
      </Suspense>
    </div>
  );
}

async function Ficha({ params }: PageProps<"/obras/[id]">) {
  const o = await obraPorId((await params).id);
  if (!o) notFound();
  return <FichaObra o={o} titulo="h1" />;
}
