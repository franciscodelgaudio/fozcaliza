import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container, FlagStripe } from "@/components/fz/base";
import { Historia, type DadosHistoria, type Passo } from "@/components/fz/historia";
import { URL_LAI } from "@/components/fz/licitacoes";
import { formatarData, formatarInteiro, formatarMoedaCurta } from "@/lib/formato";
import { porCidade, porDisputa, porOrigem, type TipoDisputa } from "@/lib/licitacoes/agregados";
import { filtrar } from "@/lib/licitacoes/consulta";
import { fontesLicitacoes } from "@/lib/licitacoes/fontes";
import type { Origem } from "@/lib/licitacoes/fornecedores";
import { licitacoes } from "@/lib/licitacoes/modelo";
import { anos } from "@/lib/tce/dados";
import { ATIVAS, obras as todasObras, type Alerta } from "@/lib/obras/modelo";

export const metadata: Metadata = { title: "Para onde vai o dinheiro das compras de Foz" };

// Só passos com dado real. Preço por item entra quando houver fonte (PNCP);
// nada fictício na tela.

const COR: Record<Origem, string> = {
  foz: "var(--fz-verde-700)",
  pr: "#7fb896",
  fora: "var(--fz-cinza-700)",
  "sem-informacao": "#c9ced4",
};

const COR_DISPUTA: Record<TipoDisputa, string> = {
  "duas-ou-mais": "var(--fz-verde-700)",
  uma: "var(--fz-ambar)",
  "sem-participantes": "var(--fz-cinza-400)",
  "sem-licitar": "var(--fz-alerta-700)",
};

const COR_OBRA: Partial<Record<Alerta, string>> = {
  "em-dia": "var(--fz-verde-700)",
  "prazo-vencido": "var(--fz-ambar)",
  "sem-medicao": "#c76b2a",
  paralisada: "var(--fz-alerta-700)",
  "nao-iniciada": "var(--fz-cinza-200)",
};
const TEXTO_OBRA: Partial<Record<Alerta, [string, string]>> = {
  "em-dia": ["dentro do prazo", "dentro do prazo"],
  "prazo-vencido": ["com prazo vencido", "com prazo vencido"],
  "sem-medicao": ["sem medição há 6+ meses", "sem medição há 6+ meses"],
  paralisada: ["paralisada", "paralisadas"],
  "nao-iniciada": ["não iniciada", "não iniciadas"],
};

const pct = (f: number) => `${Math.round(f * 100)}%`;

export default function Page() {
  return (
    <>
      <section className="bg-verde-900 text-white">
        <Container className="flex flex-col gap-[18px] pt-[72px] pb-16">
          <p className="text-[13px] font-bold tracking-[0.08em] text-[#bfe3cd] uppercase">Licitações e obras · Foz do Iguaçu</p>
          <h1 className="max-w-[880px] text-[clamp(36px,5.5vw,60px)] leading-[1.05] font-extrabold tracking-[-0.03em]">
            Para onde vai o dinheiro das compras de Foz
          </h1>
          <p className="max-w-[680px] text-[20px] leading-[1.55] text-[#dcefe3]">
            Uma explicação em poucos passos. Role a página para avançar. Se preferir, vá direto aos dados.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <a
              href="#historia"
              className="inline-flex min-h-12 items-center rounded-[10px] bg-white px-[22px] text-[16px] font-extrabold text-verde-900 hover:bg-verde-100"
            >
              Começar ↓
            </a>
            <Link
              href="/licitacoes/explorar"
              className="inline-flex min-h-12 items-center rounded-[10px] border border-[#bfe3cd] px-[22px] text-[16px] font-semibold text-white hover:bg-white/10"
            >
              Prefiro explorar os dados
            </Link>
          </div>
        </Container>
        <FlagStripe />
      </section>

      <Suspense fallback={<Container className="py-16 text-cinza-600">Lendo os dados do TCE-PR…</Container>}>
        <HistoriaReal />
      </Suspense>

      <Container>
        <section aria-labelledby="h-acao" className="mt-12 flex flex-col gap-5 rounded-2xl bg-verde-900 p-8 text-white">
          <h2 id="h-acao" className="text-[26px] font-extrabold">
            O que você pode fazer
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            <div className="flex flex-col gap-1.5">
              <strong className="text-[16px]">Pedir o documento</strong>
              <span className="text-[14px] leading-normal text-[#dcefe3]">
                Faça um pedido pela{" "}
                <a href={URL_LAI} target="_blank" rel="noreferrer" className="text-white underline underline-offset-2">
                  Lei de Acesso à Informação
                  <span className="sr-only"> (abre o site da prefeitura em nova aba)</span>
                </a>
                . A prefeitura tem 20 dias para responder, prorrogáveis por mais 10.
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <strong className="text-[16px]">Avisar sobre uma obra</strong>
              <span className="text-[14px] leading-normal text-[#dcefe3]">Mande foto ou relato ao Observatório Social de Foz do Iguaçu.</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <strong className="text-[16px]">Levar ao controle externo</strong>
              <span className="text-[14px] leading-normal text-[#dcefe3]">
                Registre na ouvidoria do Tribunal de Contas do Paraná ou procure seu vereador.
              </span>
            </div>
          </div>
        </section>
      </Container>
    </>
  );
}

async function HistoriaReal() {
  "use cache";
  const [ano] = await anos();
  if (!ano) return <Container className="py-16">Nenhum dado do TCE-PR em dados/tce.</Container>;
  const [todas, fontes, listaObras] = await Promise.all([licitacoes(ano), fontesLicitacoes(ano), todasObras()]);
  // Mesmo recorte do explorador sem filtros: a prefeitura (administração direta).
  const ls = filtrar(todas, {});
  const comVencedor = ls.filter((l) => l.valorHomologado !== null);
  const origens = porOrigem(ls);
  const total = origens.reduce((t, o) => t + o.valor, 0);
  const cidades = porCidade(ls).filter((c) => c.municipio).slice(0, 6);
  const maior = cidades[0]?.valor || 1;
  const fatia = (o: Origem) => origens.find((x) => x.origem === o)?.fracao ?? 0;
  // Obras da prefeitura não concluídas, só com informação atualizada pelo TCE-PR.
  const ativas = listaObras.filter((o) => o.principal && ATIVAS.includes(o.alerta));
  const atuais = ativas.filter((o) => !o.desatualizada);
  const antigas = ativas.length - atuais.length;
  const ordem: Alerta[] = ["em-dia", "prazo-vencido", "sem-medicao", "paralisada", "nao-iniciada"];
  const conta = (a: Alerta) => atuais.filter((o) => o.alerta === a).length;
  const legendaObras = ordem
    .filter((a) => conta(a) > 0)
    .map((a) => ({ cor: COR_OBRA[a]!, n: conta(a), texto: TEXTO_OBRA[a]![conta(a) === 1 ? 0 : 1] }));
  const problema = conta("paralisada") + conta("sem-medicao") + conta("prazo-vencido");
  const disputa = porDisputa(ls).filter((t) => t.pago !== null);
  const grupo = (t: TipoDisputa) => disputa.find((x) => x.tipo === t);
  const [d2, d1, sl] = [grupo("duas-ou-mais"), grupo("uma"), grupo("sem-licitar")];
  const frasesDisputa = [
    d2 && `Quando duas ou mais empresas disputaram, a prefeitura pagou ${pct(d2.pago!)} do preço que ela mesma estimou.`,
    d1 && `Com uma só empresa na disputa, ${pct(d1.pago!)}.`,
    sl && `Sem licitar, ${pct(sl.pago!)}.`,
  ].filter(Boolean);
  const atualizado = fontes[0].atualizado_em ? `, publicação de ${formatarData(fontes[0].atualizado_em)}` : "";

  if (!total) return <Container className="py-16">Ainda não há licitações com vencedor publicado em {ano}.</Container>;

  const [c1, c2] = cidades;
  // Onde olhar: a primeira cidade de fora de Foz (Foz costuma liderar).
  const alvo = c1.origem === "foz" ? (c2 ?? c1) : c1;
  const corpoCidades =
    c1.origem === "foz" && c2
      ? `Depois de Foz (${formatarMoedaCurta(c1.valor)}), quem mais recebeu foram empresas de ${c2.cidade}: ${formatarMoedaCurta(c2.valor)}.`
      : c2
        ? `Empresas de ${c1.cidade} receberam ${formatarMoedaCurta(c1.valor)}. Em seguida vem ${c2.cidade}, com ${formatarMoedaCurta(c2.valor)}.`
        : `Empresas de ${c1.cidade} receberam ${formatarMoedaCurta(c1.valor)}.`;
  const passos: Passo[] = [
    {
      visual: "total",
      kicker: "O ponto de partida",
      lead: "Quando a prefeitura precisa comprar algo, de papel a uma obra, ela abre uma disputa entre empresas. Isso é uma licitação.",
      body: `Em ${ano}, nos dados publicados até agora, a prefeitura tem ${formatarInteiro(ls.length)} licitações. As ${formatarInteiro(
        comVencedor.length,
      )} que já têm vencedor somam ${formatarMoedaCurta(total)}.`,
      nota: `Fonte: TCE-PR (Portal Informação para Todos)${atualizado}. Os dados chegam com 2 a 3 meses de atraso.`,
      link: { href: "/licitacoes/explorar", texto: "Ver todas as licitações" },
    },
    {
      visual: "origem",
      kicker: "Para onde foi",
      lead: `${pct(fatia("foz"))} desse dinheiro ficou com empresas de Foz.`,
      body: `O resto foi para empresas de outras cidades do Paraná (${pct(fatia("pr"))}) e de outros estados (${pct(fatia("fora"))}).`,
      nota: "Comprar de fora não é errado. A lei manda escolher a proposta mais vantajosa, não a mais próxima.",
      link: { href: "/licitacoes/explorar?agrupar=cidade", texto: "Ver empresas por cidade" },
    },
    {
      visual: "cidades",
      kicker: "Onde olhar",
      lead: "Estas são as cidades das empresas que mais receberam.",
      body: corpoCidades,
      nota: "Uma concentração pode ter explicação simples, como um único contrato grande. O próximo passo é abrir e ver.",
      link: alvo.municipio
        ? {
            href: `/licitacoes/explorar?cidade=${encodeURIComponent(alvo.municipio)}${alvo.uf ? `&uf=${alvo.uf}` : ""}`,
            texto: `Ver as compras de empresas de ${alvo.cidade}`,
          }
        : undefined,
    },
    ...(atuais.length
      ? [
          {
            visual: "obras",
            kicker: "As obras",
            lead: `Parte desse dinheiro vira obra. A prefeitura informa ao TCE-PR ${formatarInteiro(atuais.length)} obras não concluídas, que somam ${formatarMoedaCurta(
              atuais.reduce((t, o) => t + o.valor, 0),
            )}.`,
            body: `Cada ponto é uma obra. ${
              problema
                ? `${formatarInteiro(problema)} ${problema === 1 ? "pede" : "pedem"} atenção: paralisada, sem medição há seis meses ou mais, ou com o prazo vencido.`
                : "Nenhuma está paralisada nem com prazo vencido."
            }`,
            nota: `A situação é a declarada pela prefeitura.${
              antigas ? ` Outras ${formatarInteiro(antigas)} obras antigas constam como não concluídas, sem informação atualizada.` : ""
            }`,
            link: { href: "/licitacoes/explorar?aba=obras", texto: "Ver as obras" },
          } satisfies Passo,
        ]
      : []),
    ...(disputa.length
      ? [
          {
            visual: "disputa",
            kicker: "Houve disputa?",
            lead: "De volta às compras: houve concorrência de verdade?",
            body: frasesDisputa.join(" "),
            nota: "Sem licitar é permitido em casos previstos na lei, como fornecedor exclusivo ou valor pequeno. E pouco desconto não prova sobrepreço: o estimado pode ter sido baixo.",
            link: { href: "/licitacoes/explorar?sinais=2", texto: "Ver compras com mais sinais de risco" },
          } satisfies Passo,
        ]
      : []),
    {
      visual: "fim",
      kicker: "Sua vez",
      lead: "Essa foi a visão geral. Agora você pode olhar o que quiser.",
      body: "Busque uma empresa, uma compra ou uma secretaria. Cada número desta história pode ser aberto e conferido.",
    },
  ];

  const d: DadosHistoria = {
    total: formatarMoedaCurta(total),
    subtitulo: `em ${formatarInteiro(comVencedor.length)} licitações com vencedor · ${ano}`,
    segmentos: origens.map((o) => ({
      rotulo: o.rotulo,
      fatia: pct(o.fracao),
      valor: o.origem === "sem-informacao" && !o.valor ? "Nenhum valor" : formatarMoedaCurta(o.valor),
      largura: o.fracao * 100,
      cor: COR[o.origem],
    })),
    descricaoBarra: origens.map((o) => `${o.rotulo} ${pct(o.fracao)}`).join(", ") + ".",
    cidades: cidades.map((c) => ({
      nome: c.cidade,
      valor: formatarMoedaCurta(c.valor),
      largura: (c.valor / maior) * 100,
      destaque: c.origem === "foz",
      cor: COR[c.origem],
    })),
    obras: {
      pontos: ordem.flatMap((a) => atuais.filter((o) => o.alerta === a).map(() => ({ cor: COR_OBRA[a]! }))),
      legenda: legendaObras,
      descricao: legendaObras.map((l) => `${l.n} ${l.texto}`).join(", ") + ".",
    },
    disputa: disputa.map((t) => ({
      rotulo: t.rotulo,
      detalhe: `${t.tipo === "sem-licitar" ? "dispensa ou inexigibilidade · " : ""}${formatarInteiro(t.licitacoes)} ${
        t.licitacoes === 1 ? "compra" : "compras"
      } · ${formatarMoedaCurta(t.contratado)}`,
      pago: t.pago!,
      cor: COR_DISPUTA[t.tipo],
    })),
    passos,
    fonte: "TCE-PR",
  };

  return <Historia d={d} />;
}
