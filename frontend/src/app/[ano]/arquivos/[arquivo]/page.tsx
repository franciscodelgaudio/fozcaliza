import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Carregando, Filtros, Paginacao } from "@/components/filtros";
import { Tabela } from "@/components/tabela";
import { formatarInteiro, tamanho, tipoPorNome } from "@/lib/formato";
import { consultar, entidades, lerParametros } from "@/lib/tce/consulta";
import { arquivos, CAMPOS_CONTROLE, registros } from "@/lib/tce/dados";

type Props = PageProps<"/[ano]/arquivos/[arquivo]">;

export default function Page(props: Props) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo {...props} />
    </Suspense>
  );
}

/** Qualquer XML do ano como tabela, com todas as colunas. */
async function Conteudo({ params, searchParams }: Props) {
  const { ano: a, arquivo } = await params;
  if (!/^\d{4}$/.test(a)) notFound();
  const ano = Number(a);
  const info = (await arquivos(ano)).find((x) => x.nome === arquivo);
  if (!info) notFound();
  const p = lerParametros(await searchParams);
  const rs = await registros(ano, arquivo);

  const campos: string[] = [];
  const vistos = new Set<string>();
  for (const r of rs.slice(0, 2000))
    for (const k of Object.keys(r))
      if (!vistos.has(k) && !CAMPOS_CONTROLE.has(k) && !k.startsWith("calc_")) {
        vistos.add(k);
        campos.push(k);
      }

  const r = consultar(rs, { ...p, ordem: "arquivo" }, { busca: [] });
  const base = `/${ano}/arquivos/${arquivo}`;
  const nomeArquivo = `${ano}_410830_${arquivo}.xml`;

  return (
    <div className="flex flex-col gap-4">
      <nav className="text-sm text-muted-foreground">
        <Link href={`/${ano}`} className="hover:text-foreground">
          {ano}
        </Link>{" "}
        / arquivos / {arquivo}
      </nav>
      <div>
        <h1 className="font-mono text-xl font-semibold break-all">{nomeArquivo}</h1>
        <p className="text-sm text-muted-foreground">
          Do zip {info.tema}.zip · {tamanho(info.bytes)} · {formatarInteiro(rs.length)} registros · {campos.length} colunas.
          Valores como publicados (só datas, valores e CNPJ formatados para leitura).
        </p>
      </div>
      {rs.length > 0 && (
        <>
          <Filtros base={base} p={p} entidades={entidades(rs)} ordens={[]} />
          <p className="text-sm text-muted-foreground">{formatarInteiro(r.total)} registros</p>
          <Tabela colunas={campos.map((c) => ({ campo: c, rotulo: c, tipo: tipoPorNome(c) }))} linhas={r.itens.map((i) => i.r)} />
          <Paginacao base={base} p={p} pagina={r.pagina} paginas={r.paginas} />
        </>
      )}
      {rs.length === 0 && <p className="text-sm text-muted-foreground">Arquivo publicado sem registros.</p>}
    </div>
  );
}
