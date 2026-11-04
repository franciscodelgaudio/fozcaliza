import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10 sm:px-6">
      <h1 className="text-[32px] font-extrabold tracking-[-0.02em] text-tinta">Página não encontrada</h1>
      <p className="text-[17px] text-cinza-700">
        O endereço pode estar errado, ou o registro pode ter saído da publicação mais recente do TCE-PR.
      </p>
      <Link href="/licitacoes/explorar" className="inline-flex min-h-11 w-fit items-center text-verde-700 underline underline-offset-2">
        Ir para o explorador de licitações
      </Link>
    </div>
  );
}
