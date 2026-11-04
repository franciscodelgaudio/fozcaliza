import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Rotulo } from "@/components/fz/base";
import { AgregadoCidades, Abas, FichaLicitacao, FiltrosLicitacoes, ItemLicitacao } from "@/components/fz/licitacoes";
import { formatarData, formatarInteiro, formatarMoeda } from "@/lib/formato";
import { consultarLicitacoes, lerParametrosLicitacoes, opcoes, publica, urlLicitacoes } from "@/lib/licitacoes/consulta";
import { fontesLicitacoes } from "@/lib/licitacoes/fontes";
import { entidadesDe, licitacoes } from "@/lib/licitacoes/modelo";
import { anos } from "@/lib/tce/dados";

export const metadata: Metadata = { title: "Explorar licitações e obras" };

const BASE = "/licitacoes/explorar";
const botaoPagina = "inline-flex min-h-11 items-center rounded-[10px] border border-verde-borda px-4 text-verde-800 hover:bg-verde-050";

export default function Page(props: PageProps<"/licitacoes/explorar">) {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/licitacoes" className="inline-flex min-h-11 w-fit items-center text-[15px] text-verde-700 underline underline-offset-2">
        ← Voltar para a explicação
      </Link>
      <h1 className="text-[clamp(30px,4.5vw,44px)] leading-tight font-extrabold text-verde-900">Explorar licitações e obras</h1>
      <Suspense fallback={<p className="py-10 text-cinza-600">Lendo os dados do TCE-PR…</p>}>
        <Conteudo {...props} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: PageProps<"/licitacoes/explorar">) {
  const sp = await searchParams;
  if (sp.aba === "obras") {
    return (
      <>
        <Abas aba="obras" />
        <p className="rounded-2xl border border-linha bg-fundo-alt p-6 text-[17px]">
          A aba de obras ainda está em preparação. O TCE-PR não publica o percentual executado de cada obra; ele virá do mapa do
          Observatório Social e do Portal da Transparência da prefeitura.
        </p>
      </>
    );
  }

  const [ano] = await anos();
  if (!ano) return <p>Nenhum dado do TCE-PR em dados/tce.</p>;
  const p = lerParametrosLicitacoes(sp);
  const [todas, fontes] = await Promise.all([licitacoes(ano), fontesLicitacoes(ano)]);
  const r = consultarLicitacoes(todas, p);
  const cidades = [...new Set(todas.flatMap((l) => l.vencedores.map((v) => v.municipio).filter((m): m is string => !!m)))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const selecionada = p.sel ? todas.find((l) => l.id === p.sel) : undefined;
  const porCidade = p.agrupar === "cidade";

  return (
    <>
      <Abas aba="licitacoes" />
      <FiltrosLicitacoes base={BASE} p={p} opcoes={{ entidades: entidadesDe(todas), ...opcoes(todas, p.entidade), cidades }} />
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p aria-live="polite" className="text-[17px]">
          <strong className="tabular-nums">{formatarInteiro(r.total)}</strong> {r.total === 1 ? "licitação" : "licitações"} ·{" "}
          <span className="tabular-nums">{formatarMoeda(r.valorHomologado)}</span> contratados
          {r.semVencedor > 0 && <span className="text-cinza-600"> · {formatarInteiro(r.semVencedor)} ainda sem vencedor publicado</span>}
        </p>
        <Link
          href={urlLicitacoes(BASE, p, { agrupar: porCidade ? undefined : "cidade", sel: undefined, pagina: undefined })}
          className="inline-flex min-h-11 items-center text-[15px] font-semibold text-verde-700 underline underline-offset-2"
        >
          {porCidade ? "Ver a lista de licitações" : "Ver empresas por cidade"}
        </Link>
      </div>
      <Rotulo>
        Ano {ano} · TCE-PR{fontes[0].atualizado_em ? `, publicação de ${formatarData(fontes[0].atualizado_em)}` : ""}
      </Rotulo>

      {r.total === 0 ? (
        <p className="rounded-2xl border border-linha bg-fundo-alt p-6 text-[17px]">Nenhuma licitação com esses filtros.</p>
      ) : porCidade ? (
        <AgregadoCidades ls={r.filtradas} base={BASE} p={p} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <ul className="flex flex-col gap-3">
              {r.itens.map((l) => (
                <ItemLicitacao
                  key={l.id}
                  l={l}
                  href={urlLicitacoes(BASE, p, { sel: l.id })}
                  hrefCelular={`/licitacoes/${l.id}`}
                  selecionado={l.id === p.sel}
                />
              ))}
            </ul>
            {r.paginas > 1 && (
              <nav aria-label="Páginas" className="flex items-center justify-between gap-2 text-[15px]">
                {r.pagina > 1 ? (
                  <Link className={botaoPagina} href={urlLicitacoes(BASE, p, { pagina: String(r.pagina - 1), sel: undefined })}>
                    ← Anteriores
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-cinza-600">
                  Página {r.pagina} de {r.paginas}
                </span>
                {r.pagina < r.paginas ? (
                  <Link className={botaoPagina} href={urlLicitacoes(BASE, p, { pagina: String(r.pagina + 1), sel: undefined })}>
                    Próximas →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </div>
          <div className="max-lg:hidden">
            <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
              {selecionada ? (
                <FichaLicitacao l={publica(selecionada)} fontes={fontes} />
              ) : (
                <p className="rounded-2xl border border-dashed border-cinza-300 p-6 text-[17px] text-cinza-600">
                  Escolha uma licitação na lista para ver a ficha.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
