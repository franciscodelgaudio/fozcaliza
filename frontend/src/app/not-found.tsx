import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 py-10">
      <h1 className="text-[32px] font-extrabold text-verde-900">Página não encontrada</h1>
      <p className="text-[17px] text-cinza-700">
        O endereço pode estar errado, ou o registro pode ter saído da publicação mais recente do TCE-PR.
      </p>
      <Link href="/licitacoes/explorar" className="inline-flex min-h-11 w-fit items-center text-verde-700 underline underline-offset-2">
        Ir para o explorador de licitações
      </Link>
    </div>
  );
}
