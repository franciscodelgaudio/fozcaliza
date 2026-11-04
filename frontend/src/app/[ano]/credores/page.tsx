import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Carregando, Filtros, Paginacao } from "@/components/filtros";
import { Tabela } from "@/components/tabela";
import { formatarInteiro, formatarMoeda } from "@/lib/formato";
import { consultar, lerParametros } from "@/lib/tce/consulta";
import { numero, type Registro } from "@/lib/tce/dados";
import { linhas, tema } from "@/lib/tce/temas";

type Props = PageProps<"/[ano]/credores">;

export default function Page(props: Props) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo {...props} />
    </Suspense>
  );
}

/** Um credor por documento (CNPJ ou CPF mascarado) + nome. */
async function credores(ano: number): Promise<Registro[]> {
  const empenhos = await linhas(ano, tema("despesas")!);
  const m = new Map<string, { doc: string; nome: string; empenhado: number; pago: number; n: number; entidades: Set<string> }>();
  for (const e of empenhos) {
    const doc = e.nrDocCredor || "";
    const nome = e.nmCredor || "(credor não informado)";
    const chave = `${doc}|${nome}`;
    let c = m.get(chave);
    if (!c) m.set(chave, (c = { doc, nome, empenhado: 0, pago: 0, n: 0, entidades: new Set() }));
    c.empenhado += numero(e.vlEmpenho);
    c.pago += numero(e.calc_pago);
    c.n++;
    c.entidades.add(e.nmEntidade);
  }
  return [...m.values()].map((c) => ({
    nmCredor: c.nome,
    nrDocCredor: c.doc,
    empenhos: String(c.n),
    entidades: [...c.entidades].join("; "),
    vlEmpenhado: c.empenhado.toFixed(2),
    vlPago: c.pago.toFixed(2),
  }));
}

async function Conteudo({ params, searchParams }: Props) {
  const { ano: a } = await params;
  if (!/^\d{4}$/.test(a)) notFound();
  const ano = Number(a);
  const p = lerParametros(await searchParams);
  const rs = await credores(ano);
  const total = rs.reduce((t, r) => t + numero(r.vlPago), 0);
  const r = consultar(rs, p, { busca: ["nmCredor", "nrDocCredor"], valor: "vlPago" });
  const base = `/${ano}/credores`;

  return (
    <div className="flex flex-col gap-4">
      <nav className="text-sm text-muted-foreground">
        <Link href={`/${ano}`} className="hover:text-foreground">
          {ano}
        </Link>{" "}
        / Quem recebeu
      </nav>
      <div>
        <h1 className="text-2xl font-semibold">Quem recebeu</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Credores dos empenhos de {ano}, ordenados pelo valor pago (pagamentos − estornos). Inclui folha, previdência e
          repasses, sem separação. Pagamentos de restos a pagar de anos anteriores não entram, porque o empenho de origem
          (com o credor) está no arquivo de outro ano. CPFs vêm mascarados pelo TCE-PR.
        </p>
      </div>
      <Filtros base={base} p={p} entidades={[]} ordens={[]} />
      <p className="text-sm text-muted-foreground">
        {formatarInteiro(r.total)} credores · pago: <strong className="text-foreground">{formatarMoeda(r.soma ?? 0)}</strong>
        {p.q && <> de {formatarMoeda(total)}</>}
      </p>
      <Tabela
        colunas={[
          { campo: "nmCredor", rotulo: "Credor" },
          { campo: "nrDocCredor", rotulo: "Documento", tipo: "doc" },
          { campo: "entidades", rotulo: "Entidades", tipo: "longo" },
          { campo: "empenhos", rotulo: "Empenhos", tipo: "numero" },
          { campo: "vlEmpenhado", rotulo: "Empenhado", tipo: "moeda" },
          { campo: "vlPago", rotulo: "Pago", tipo: "moeda" },
        ]}
        linhas={r.itens.map((i) => i.r)}
        link={(c) => `/${ano}/despesas?q=${encodeURIComponent(c.nrDocCredor && !c.nrDocCredor.includes("*") ? c.nrDocCredor : c.nmCredor)}`}
      />
      <Paginacao base={base} p={p} pagina={r.pagina} paginas={r.paginas} />
    </div>
  );
}
