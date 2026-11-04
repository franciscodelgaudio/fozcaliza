import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Carregando } from "@/components/filtros";
import { VisaoAno } from "@/components/visao-ano";

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
