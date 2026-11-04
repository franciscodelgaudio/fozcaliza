import Link from "next/link";
import { formatarInteiro } from "@/lib/formato";
import { urlCom, type Parametros } from "@/lib/tce/consulta";

const campo =
  "h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/** Filtros por formulário GET: funciona sem JavaScript e a URL fica compartilhável. */
export function Filtros({
  base,
  p,
  entidades,
  ordens,
}: {
  base: string;
  p: Parametros;
  entidades: { nome: string; n: number }[];
  ordens: { valor: string; rotulo: string }[];
}) {
  return (
    <form action={base} className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-muted-foreground">
        Buscar
        <input name="q" defaultValue={p.q} placeholder="nome, CNPJ, objeto…" className={campo} />
      </label>
      {entidades.length > 1 && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Entidade
          <select name="entidade" defaultValue={p.entidade ?? ""} className={`${campo} max-w-72`}>
            <option value="">Todas</option>
            {entidades.map((e) => (
              <option key={e.nome} value={e.nome}>
                {e.nome} ({formatarInteiro(e.n)})
              </option>
            ))}
          </select>
        </label>
      )}
      {ordens.length > 1 && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Ordem
          <select name="ordem" defaultValue={p.ordem ?? ordens[0].valor} className={campo}>
            {ordens.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        Filtrar
      </button>
      {(p.q || p.entidade || p.ordem) && (
        <Link href={base} className="h-9 px-2 text-sm leading-9 text-muted-foreground hover:text-foreground">
          Limpar
        </Link>
      )}
    </form>
  );
}

export function Paginacao({ base, p, pagina, paginas }: { base: string; p: Parametros; pagina: number; paginas: number }) {
  if (paginas <= 1) return null;
  const botao = "rounded-lg border px-3 py-1.5 text-sm hover:bg-muted";
  return (
    <nav className="flex items-center justify-between gap-2 pt-4 text-sm">
      {pagina > 1 ? (
        <Link className={botao} href={urlCom(base, p, { pagina: String(pagina - 1) })}>
          ← Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground">
        Página {formatarInteiro(pagina)} de {formatarInteiro(paginas)}
      </span>
      {pagina < paginas ? (
        <Link className={botao} href={urlCom(base, p, { pagina: String(pagina + 1) })}>
          Próxima →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function Carregando() {
  return <p className="py-10 text-sm text-muted-foreground">Lendo os XML do TCE-PR…</p>;
}
