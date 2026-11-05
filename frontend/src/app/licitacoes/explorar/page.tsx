import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container, Rotulo } from "@/components/fz/base";
import { AgregadoCidades, Abas, FichaLicitacao, FiltrosLicitacoes, ItemLicitacao } from "@/components/fz/licitacoes";
import { formatarData, formatarInteiro, formatarMoeda } from "@/lib/formato";
import { consultarLicitacoes, lerParametrosLicitacoes, opcoes, publica, urlLicitacoes, type ParametrosLicitacoes } from "@/lib/licitacoes/consulta";
import { fontesLicitacoes } from "@/lib/licitacoes/fontes";
import { entidadesDe, licitacoes } from "@/lib/licitacoes/modelo";
import { sinaisDe } from "@/lib/licitacoes/sinais";
import { compararLicitacao } from "@/lib/precos/sinapi";
import { FichaObra, FiltrosObras, ItemObra } from "@/components/fz/obras";
import { consultarObras, lerParametrosObras, type ParametrosObras } from "@/lib/obras/consulta";
import { obras } from "@/lib/obras/modelo";
import { orcamentoDaObra } from "@/lib/obras/orcamento";
import { anos } from "@/lib/tce/dados";

export const metadata: Metadata = { title: "Explorar licitações e obras" };

const BASE = "/licitacoes/explorar";
const botaoPagina = "inline-flex min-h-11 items-center rounded-[10px] border border-verde-borda bg-white px-4 font-semibold text-verde-700 hover:bg-verde-050";

export default function Page(props: PageProps<"/licitacoes/explorar">) {
  return (
    <div className="flex-1 bg-fundo-verde">
      <Container largo className="flex flex-col gap-5 pt-6 pb-16">
        <div className="flex flex-col gap-2">
          <Link href="/licitacoes" className="inline-flex min-h-11 w-fit items-center text-[15px] font-semibold text-verde-700 hover:text-verde-800">
            ← Voltar para a explicação
          </Link>
          <h1 className="text-[clamp(28px,4vw,38px)] leading-tight font-extrabold tracking-[-0.02em]">Explorar licitações e obras</h1>
        </div>
        <Suspense fallback={<p className="py-10 text-cinza-600">Lendo os dados do TCE-PR…</p>}>
          <Conteudo {...props} />
        </Suspense>
      </Container>
    </div>
  );
}

async function Conteudo({ searchParams }: PageProps<"/licitacoes/explorar">) {
  const sp = await searchParams;
  if (sp.aba === "obras") return <AbaObras p={lerParametrosObras(sp)} />;
  return <AbaLicitacoes p={lerParametrosLicitacoes(sp)} />;
}

/** Em cache por combinação de filtros. */
async function AbaLicitacoes({ p }: { p: ParametrosLicitacoes }) {
  "use cache";
  const [ano] = await anos();
  if (!ano) return <p>Nenhum dado do TCE-PR em dados/tce.</p>;
  const [todas, fontes] = await Promise.all([licitacoes(ano), fontesLicitacoes(ano)]);
  const r = consultarLicitacoes(todas, p);
  const sinais = sinaisDe(todas);
  const cidades = [...new Set(todas.flatMap((l) => l.vencedores.map((v) => v.municipio).filter((m): m is string => !!m)))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const selecionada = p.sel ? todas.find((l) => l.id === p.sel) : undefined;
  const precos = selecionada ? await compararLicitacao(selecionada) : [];
  const porCidade = p.agrupar === "cidade";

  return (
    <>
      <Abas aba="licitacoes" />
      <FiltrosLicitacoes base={BASE} p={p} opcoes={{ entidades: entidadesDe(todas), ...opcoes(todas, p.entidade), cidades }} />
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p aria-live="polite" className="text-[15px] text-cinza-700">
          <strong className="text-tinta tabular-nums">{formatarInteiro(r.total)}</strong> {r.total === 1 ? "licitação" : "licitações"} ·{" "}
          <span className="tabular-nums">{formatarMoeda(r.valorHomologado)}</span> contratados
          {r.semVencedor > 0 && <span className="text-cinza-600"> · {formatarInteiro(r.semVencedor)} ainda sem vencedor publicado</span>}
        </p>
        <Link
          href={urlLicitacoes(BASE, p, { agrupar: porCidade ? undefined : "cidade", sel: undefined, pagina: undefined })}
          className="inline-flex min-h-11 items-center text-[15px] font-bold text-verde-700 hover:text-verde-800"
        >
          {porCidade ? "Ver a lista de licitações" : "Ver empresas por cidade"}
        </Link>
      </div>
      <Rotulo>
        Ano {ano} · TCE-PR{fontes[0].atualizado_em ? `, publicação de ${formatarData(fontes[0].atualizado_em)}` : ""}
      </Rotulo>

      {r.total === 0 ? (
        <p className="rounded-xl border border-dashed border-cinza-300 bg-white p-6 text-[17px] text-cinza-700">Nenhuma licitação com esses filtros.</p>
      ) : porCidade ? (
        <AgregadoCidades ls={r.filtradas} base={BASE} p={p} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <ul className="flex flex-col gap-2.5">
              {r.itens.map((l) => (
                <ItemLicitacao
                  key={l.id}
                  l={l}
                  href={urlLicitacoes(BASE, p, { sel: l.id })}
                  hrefCelular={`/licitacoes/${l.id}`}
                  selecionado={l.id === p.sel}
                  sinais={sinais.get(l.id)}
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
                <FichaLicitacao l={publica(selecionada)} fontes={fontes} sinais={sinais.get(selecionada.id)} precos={precos} />
              ) : (
                <p className="rounded-2xl border border-dashed border-cinza-300 bg-white p-6 text-[17px] text-cinza-600">
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

async function AbaObras({ p }: { p: ParametrosObras }) {
  "use cache";
  const todas = await obras();
  const r = consultarObras(todas, p);
  const selecionada = p.sel ? todas.find((o) => o.id === p.sel) : undefined;
  const orcamentoObra = selecionada?.portal ? await orcamentoDaObra(selecionada.portal.idOxy) : null;
  const referencia = todas.reduce((m, o) => (o.referencia > m ? o.referencia : m), "");
  return (
    <>
      <Abas aba="obras" />
      <FiltrosObras p={p} />
      <p aria-live="polite" className="text-[15px] text-cinza-700">
        <strong className="text-tinta tabular-nums">{formatarInteiro(r.total)}</strong> {r.total === 1 ? "obra" : "obras"} ·{" "}
        <span className="tabular-nums">{formatarMoeda(r.valor)}</span> em obras
      </p>
      <Rotulo>
        TCE-PR, cadastro de obras do SIM-AM, informação até {referencia.slice(5, 7)}/{referencia.slice(0, 4)} · Obrasgov.br
      </Rotulo>
      {r.total === 0 ? (
        <p className="rounded-xl border border-dashed border-cinza-300 bg-white p-6 text-[17px] text-cinza-700">Nenhuma obra com esses filtros.</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <ul className="flex min-w-0 flex-col gap-2.5">
            {r.itens.map((o) => (
              <ItemObra key={o.id} o={o} p={p} selecionada={o.id === p.sel} />
            ))}
          </ul>
          <div className="max-lg:hidden">
            <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
              {selecionada ? (
                <FichaObra o={selecionada} orcamento={orcamentoObra} />
              ) : (
                <p className="rounded-2xl border border-dashed border-cinza-300 bg-white p-6 text-[17px] text-cinza-600">
                  Escolha uma obra na lista para ver a ficha.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
