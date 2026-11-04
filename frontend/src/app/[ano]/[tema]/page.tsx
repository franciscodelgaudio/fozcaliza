import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Carregando, Filtros, Paginacao } from "@/components/filtros";
import { Tabela } from "@/components/tabela";
import { formatar, formatarInteiro } from "@/lib/formato";
import { consultar, entidades, lerParametros, type Parametros } from "@/lib/tce/consulta";
import { idDe, linhas, tema as obterTema } from "@/lib/tce/temas";

type Props = PageProps<"/[ano]/[tema]">;

export default function Page(props: Props) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo {...props} />
    </Suspense>
  );
}

async function Conteudo({ params, searchParams }: Props) {
  const { ano: a, tema: slug } = await params;
  if (!obterTema(slug) || !/^\d{4}$/.test(a)) notFound();
  return <Resultado ano={Number(a)} slug={slug} p={lerParametros(await searchParams)} />;
}

/** Em cache por ano, tema e filtros: a mesma URL não relê nem refiltra o XML. */
async function Resultado({ ano, slug, p }: { ano: number; slug: string; p: Parametros }) {
  "use cache";
  const t = obterTema(slug)!;
  const rs = await linhas(ano, t);
  const r = consultar(rs, p, { busca: t.busca, valor: t.valor?.campo, data: t.data });
  const base = `/${ano}/${t.slug}`;
  const ordens = [
    ...(t.valor ? [{ valor: "valor", rotulo: `Maior ${t.valor.rotulo.toLowerCase()}` }] : []),
    ...(t.data ? [{ valor: "data", rotulo: "Mais recentes" }] : []),
    { valor: "arquivo", rotulo: "Ordem do arquivo" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <nav className="text-sm text-muted-foreground">
        <Link href={`/${ano}`} className="hover:text-foreground">
          {ano}
        </Link>{" "}
        / {t.nome}
      </nav>
      <div>
        <h1 className="text-2xl font-semibold">{t.nome}</h1>
        <p className="text-sm text-muted-foreground">
          {t.descricao} Arquivo <Link className="underline underline-offset-2" href={`/${ano}/arquivos/${t.arquivo}`}>{t.arquivo}.xml</Link>.
        </p>
      </div>
      {rs.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">O TCE-PR não publicou registros deste tema para {ano}.</p>
      ) : (
        <>
          <Filtros base={base} p={p} entidades={entidades(rs)} ordens={ordens} />
          <p className="text-sm text-muted-foreground">
            {formatarInteiro(r.total)} registro{r.total === 1 ? "" : "s"}
            {r.soma !== undefined && t.valor && (
              <>
                {" · "}
                {t.valor.rotulo}: <strong className="text-foreground">{formatar(String(r.soma), t.valor.tipo)}</strong>
              </>
            )}
          </p>
          <Tabela
            colunas={t.colunas}
            linhas={r.itens.map((i) => i.r)}
            link={(_, i) => `${base}/${idDe(t, r.itens[i].r, r.itens[i].posicao)}`}
            vazio="Nada encontrado com esses filtros."
          />
          <Paginacao base={base} p={p} pagina={r.pagina} paginas={r.paginas} />
        </>
      )}
    </div>
  );
}
