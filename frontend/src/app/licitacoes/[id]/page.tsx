import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FichaLicitacao } from "@/components/fz/licitacoes";
import { publica } from "@/lib/licitacoes/consulta";
import { fontesLicitacoes } from "@/lib/licitacoes/fontes";
import { licitacaoPorId, licitacoes } from "@/lib/licitacoes/modelo";
import { sinaisDaLicitacao } from "@/lib/licitacoes/sinais";
import { compararLicitacao } from "@/lib/precos/sinapi";
import { anos } from "@/lib/tce/dados";

// Algumas centenas por ano: todas geradas na build.
export async function generateStaticParams() {
  const ids = (await Promise.all((await anos()).map(async (a) => (await licitacoes(a)).map((l) => l.id)))).flat();
  return ids.map((id) => ({ id }));
}

async function titulo(id: string) {
  "use cache";
  const l = await licitacaoPorId(id);
  return l ? `${l.modalidade} ${l.numero}` : "Licitação";
}

export async function generateMetadata({ params }: PageProps<"/licitacoes/[id]">): Promise<Metadata> {
  return { title: await titulo((await params).id) };
}

export default function Page(props: PageProps<"/licitacoes/[id]">) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
      <Link href="/licitacoes/explorar" className="inline-flex min-h-11 w-fit items-center text-[15px] font-semibold text-verde-700 hover:text-verde-800">
        ← Voltar para o explorador
      </Link>
      <Suspense fallback={<p className="py-10 text-cinza-600">Lendo os dados do TCE-PR…</p>}>
        <Ficha {...props} />
      </Suspense>
    </div>
  );
}

async function Ficha({ params }: PageProps<"/licitacoes/[id]">) {
  return <FichaEmCache id={(await params).id} />;
}

async function FichaEmCache({ id }: { id: string }) {
  "use cache";
  const l = await licitacaoPorId(id);
  if (!l) notFound();
  const [fontes, sinais, precos] = await Promise.all([fontesLicitacoes(l.ano), sinaisDaLicitacao(l), compararLicitacao(l)]);
  return <FichaLicitacao l={publica(l)} fontes={fontes} sinais={sinais} precos={precos} titulo="h1" />;
}
