import Link from "next/link";
import { formatar, formatarInteiro, formatarMoeda, formatarMoedaCurta, tamanho } from "@/lib/formato";
import { anos, arquivos, fonte, registros, soma } from "@/lib/tce/dados";
import { linhas, TEMAS } from "@/lib/tce/temas";

export async function VisaoAno({ ano }: { ano: number }) {
  const [lista, f, xmls] = await Promise.all([anos(), fonte(ano), arquivos(ano)]);
  if (!f) {
    return (
      <p className="text-sm text-muted-foreground">
        Não há XML de {ano} em <code>dados/tce/{ano}</code>. Rode <code>node scripts/baixar-tce.mjs {ano}</code>.
      </p>
    );
  }

  const temas = await Promise.all(
    TEMAS.map(async (t) => {
      const rs = await linhas(ano, t);
      return { t, n: rs.length, total: t.valor ? soma(rs, t.valor.campo) : undefined };
    }),
  );

  const [empenhos, pagamentos, estornos] = await Promise.all([
    registros(ano, "Empenho"),
    registros(ano, "EmpenhoPagamento"),
    registros(ano, "EmpenhoPagamentoEstorno"),
  ]);
  const idsEmpenho = new Set(empenhos.map((e) => e.idEmpenho));
  const pagoMov = soma(pagamentos, "vlOperacao") - soma(estornos, "vlEstorno");
  const pagoRap =
    soma(pagamentos.filter((p) => !idsEmpenho.has(p.idEmpenho)), "vlOperacao") -
    soma(estornos.filter((p) => !idsEmpenho.has(p.idEmpenho)), "vlEstorno");

  // Até qual remessa mensal do SIM-AM cada entidade já está no arquivo.
  const remessa = new Map<string, string>();
  for (const e of empenhos) {
    const r = e.ultimoEnvioSIMAMNesteExercicio;
    if (r && (remessa.get(e.nmEntidade) ?? "") < r) remessa.set(e.nmEntidade, r);
  }
  const geradoEm = Object.values(f.temas)
    .map((t) => new Date(t.lastModified))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">Foz do Iguaçu · {ano}</h1>
          {lista.length > 1 && (
            <nav className="flex gap-1 text-sm">
              {lista.map((a) => (
                <Link
                  key={a}
                  href={`/${a}`}
                  className={`rounded-md px-2 py-1 ${a === ano ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {a}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Lido diretamente dos XML do{" "}
          <a href={f.pagina} className="underline underline-offset-2">
            Download de Dados do TCE-PR
          </a>
          , sem banco de dados. O TCE gera os arquivos uma vez por semana, com as remessas mensais do SIM-AM já fechadas
          por cada entidade, por isso os meses mais recentes ainda não aparecem.
          {geradoEm && (
            <>
              {" "}
              Arquivos desta versão gerados em{" "}
              <strong className="text-foreground">{geradoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</strong>.
            </>
          )}
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Numero rotulo="Empenhado" valor={soma(empenhos, "vlEmpenho")} nota="soma de vlEmpenho" />
        <Numero rotulo="Liquidado" valor={soma(empenhos, "vlLiquidacao")} nota="vlLiquidacao publicado nos empenhos" />
        <Numero rotulo="Pago (publicado)" valor={soma(empenhos, "vlPagamento")} nota="vlPagamento publicado nos empenhos do ano" />
        <Numero
          rotulo="Pago no ano (movimentos)"
          valor={pagoMov}
          nota={`pagamentos − estornos datados; inclui ${formatarMoedaCurta(pagoRap)} de restos a pagar de anos anteriores`}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Temas</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {temas.map(({ t, n, total }) => (
            <Link
              key={t.slug}
              href={`/${ano}/${t.slug}`}
              className="flex flex-col gap-1 rounded-xl p-4 ring-1 ring-foreground/10 transition hover:bg-muted/50"
            >
              <span className="font-medium">{t.nome}</span>
              <span className="text-2xl font-semibold tabular-nums">{formatarInteiro(n)}</span>
              <span className="text-xs text-muted-foreground">
                {n === 0 ? "nada publicado neste ano" : total !== undefined && t.valor ? `${t.valor.rotulo}: ${formatar(String(total), t.valor.tipo)}` : "registros"}
              </span>
            </Link>
          ))}
          <Link
            href={`/${ano}/credores`}
            className="flex flex-col gap-1 rounded-xl p-4 ring-1 ring-foreground/10 transition hover:bg-muted/50"
          >
            <span className="font-medium">Quem recebeu</span>
            <span className="text-sm text-muted-foreground">Credores ordenados pelo valor pago nos empenhos do ano.</span>
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Até onde vão os dados</h2>
        <p className="text-sm text-muted-foreground">Última remessa mensal do SIM-AM incluída, por entidade (arquivo de empenhos).</p>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {[...remessa].sort((a, b) => a[0].localeCompare(b[0])).map(([entidade, r]) => (
            <li key={entidade} className="flex justify-between gap-4 border-b border-border/60 py-1">
              <span>{entidade}</span>
              <span className="tabular-nums text-muted-foreground">{r.replace(/^(\d{4})\/(\d{2})$/, "$2/$1")}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Arquivos XML</h2>
        <p className="text-sm text-muted-foreground">Cada XML como o TCE publicou, com todas as colunas.</p>
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {xmls.map((x) => (
            <li key={x.nome} className="flex justify-between gap-4 border-b border-border/60 py-1">
              <Link href={`/${ano}/arquivos/${x.nome}`} className="underline-offset-2 hover:underline">
                {x.nome}
              </Link>
              <span className="text-muted-foreground tabular-nums">{tamanho(x.bytes)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: number; nota: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl p-4 ring-1 ring-foreground/10">
      <span className="text-sm text-muted-foreground">{rotulo}</span>
      <span className="text-xl font-semibold tabular-nums" title={formatarMoeda(valor)}>
        {formatarMoedaCurta(valor)}
      </span>
      <span className="text-xs text-muted-foreground">{nota}</span>
    </div>
  );
}
