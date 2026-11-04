import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Carregando } from "@/components/filtros";
import { Tabela } from "@/components/tabela";
import { formatar, tipoPorNome } from "@/lib/formato";
import { CAMPOS_CONTROLE, type Registro } from "@/lib/tce/dados";
import { agrupado, porId, tema as obterTema, TEMAS } from "@/lib/tce/temas";

type Props = PageProps<"/[ano]/[tema]/[id]">;

export default function Page(props: Props) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo {...props} />
    </Suspense>
  );
}

async function Conteudo({ params }: Props) {
  const { ano: a, tema: slug, id } = await params;
  const t = obterTema(slug);
  if (!t || !/^\d{4}$/.test(a)) notFound();
  const ano = Number(a);
  const r = (await porId(ano, t)).get(id);
  if (!r) notFound();

  const relacionados = await Promise.all(
    (t.relacionados ?? []).map(async (rel) => {
      const valor = r[rel.local ?? t.id ?? ""];
      let itens: Registro[] = [];
      if (valor) {
        for (const campo of rel.campos) {
          itens = (await agrupado(ano, rel.arquivo, campo)).get(valor) ?? [];
          if (itens.length) break;
        }
      }
      return { rel, itens };
    }),
  );

  const vinculos = await Promise.all(
    (t.vinculos ?? []).map(async (v) => {
      const destino = TEMAS.find((x) => x.slug === v.tema)!;
      const ids = [...new Set(((await agrupado(ano, v.ponte, v.de)).get(r[v.de]) ?? []).map((x) => x[v.para]).filter(Boolean))];
      const indice = await porId(ano, destino);
      return { v, destino, ids, indice };
    }),
  );

  const atributos = Object.entries(r).filter(([k]) => !CAMPOS_CONTROLE.has(k) && !k.startsWith("calc_"));

  return (
    <div className="flex flex-col gap-6">
      <nav className="text-sm text-muted-foreground">
        <Link href={`/${ano}`} className="hover:text-foreground">
          {ano}
        </Link>{" "}
        /{" "}
        <Link href={`/${ano}/${t.slug}`} className="hover:text-foreground">
          {t.nome}
        </Link>
      </nav>
      <div>
        <h1 className="text-xl font-semibold">{t.titulo(r)}</h1>
        <p className="text-sm text-muted-foreground">{r.nmEntidade}</p>
      </div>

      {t.slug === "despesas" && <ResumoEmpenho r={r} />}

      {vinculos.map(({ v, destino, ids, indice }) => (
        <section key={v.titulo} className="flex flex-col gap-2">
          <h2 className="font-semibold">{v.titulo}</h2>
          {ids.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum vínculo em {v.ponte}.xml.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {ids.map((i) => {
                const alvo = indice.get(i);
                return (
                  <li key={i}>
                    {alvo ? (
                      <Link href={`/${ano}/${destino.slug}/${i}`} className="underline underline-offset-2">
                        {destino.titulo(alvo)}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">
                        id {i} (não está no arquivo de {ano}; provavelmente de outro exercício)
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}

      {relacionados.map(({ rel, itens }) => (
        <section key={rel.titulo} className="flex flex-col gap-2">
          <h2 className="font-semibold">
            {rel.titulo} <span className="text-sm font-normal text-muted-foreground">({itens.length})</span>
          </h2>
          <Tabela colunas={rel.colunas} linhas={itens} vazio={`Nenhum registro em ${rel.arquivo}.xml.`} />
        </section>
      ))}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Todos os campos, como publicados</h2>
        <dl className="grid gap-x-6 text-sm sm:grid-cols-[max-content_1fr]">
          {atributos.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="pt-2 font-mono text-xs text-muted-foreground sm:py-1">{k}</dt>
              <dd className="border-b border-border/60 pb-2 break-words sm:py-1">{formatar(v, tipoPorNome(k)) || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function ResumoEmpenho({ r }: { r: Registro }) {
  const itens = [
    ["Empenhado", r.vlEmpenho],
    ["Liquidado (publicado)", r.vlLiquidacao],
    ["Pago (publicado)", r.vlPagamento],
    ["Pago (pagamentos − estornos)", r.calc_pago],
  ];
  const diverge = Math.abs(Number(r.vlPagamento || 0) - Number(r.calc_pago || 0)) > 0.01;
  return (
    <section className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-4">
        {itens.map(([rotulo, v]) => (
          <div key={rotulo} className="rounded-xl p-3 ring-1 ring-foreground/10">
            <div className="text-xs text-muted-foreground">{rotulo}</div>
            <div className="font-semibold tabular-nums">{formatar(v || "0", "moeda")}</div>
          </div>
        ))}
      </div>
      {diverge && (
        <p className="text-xs text-muted-foreground">
          O valor pago publicado no empenho difere da soma dos pagamentos datados no arquivo. Os dois vêm do TCE-PR; a
          diferença não é corrigida aqui.
        </p>
      )}
    </section>
  );
}
