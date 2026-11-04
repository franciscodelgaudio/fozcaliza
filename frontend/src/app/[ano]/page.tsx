import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Carregando } from "@/components/filtros";
import { VisaoAno } from "@/components/visao-ano";
import { anos } from "@/lib/tce/dados";

// Um ano por pasta em dados/tce: todos gerados na build.
export async function generateStaticParams() {
  return (await anos()).map((ano) => ({ ano: String(ano) }));
}

export default function Page({ params }: PageProps<"/[ano]">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/[ano]">["params"] }) {
  const { ano } = await params;
  if (!/^\d{4}$/.test(ano)) notFound();
  return <VisaoAno ano={Number(ano)} />;
}
