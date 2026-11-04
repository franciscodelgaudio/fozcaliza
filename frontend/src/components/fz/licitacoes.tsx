// Explorador de licitações: filtros, item de lista, agregação por cidade e ficha (seção 5).
// Tudo renderizado no servidor; filtros são formulários GET (funcionam sem JavaScript
// e a URL fica compartilhável).

import Link from "next/link";
import type { ReactNode } from "react";
import { Pill, type Tom } from "@/components/fz/base";
import { formatarData, formatarInteiro, formatarMoeda, formatarMoedaCurta } from "@/lib/formato";
import { porCidade } from "@/lib/licitacoes/agregados";
import { cidadeDe, nomeExibido, urlLicitacoes, type ParametrosLicitacoes } from "@/lib/licitacoes/consulta";
import type { FonteDado } from "@/lib/licitacoes/fontes";
import { ORIGENS, type Origem } from "@/lib/licitacoes/fornecedores";
import { rotuloGestao } from "@/lib/licitacoes/gestao";
import { MODALIDADES_COMPETITIVAS, type Licitacao, type Vencedor } from "@/lib/licitacoes/modelo";
import type { CasamentoPncp } from "@/lib/licitacoes/pncp";
import { SINAIS, type EstadoSinal, type ResultadoSinais } from "@/lib/licitacoes/sinais";

/** Página do SIC da prefeitura no Portal da Transparência (pedido via e-SIC ou presencial). Conferir: pendência 5. */
export const URL_LAI = "http://www2.pmfi.pr.gov.br/giig/portais/portaldatransparencia/Templates/wfrmPaginaPadrao.aspx?IdLinkItem=206";

const campo =
  "min-h-11 w-full rounded-[10px] border border-cinza-300 bg-white px-3 text-[15px] text-tinta focus-visible:border-verde-700";
const botaoPrimario =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] bg-verde-700 px-4 text-[15px] font-bold text-white hover:bg-verde-800";
const botaoSecundario =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] border border-cinza-300 bg-white px-4 text-[15px] font-semibold text-verde-700 hover:bg-verde-050";
const botaoLimpar =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] border border-verde-borda bg-white px-4 text-[15px] font-semibold text-verde-700 hover:bg-verde-050";

const rotuloOrigem = (o: Origem) => ORIGENS.find((x) => x.id === o)?.rotulo ?? o;
const tomOrigem = (o: Origem): Tom => (o === "sem-informacao" ? "alerta" : "neutro");

export function Abas({ aba }: { aba: "licitacoes" | "obras" }) {
  const classe = (ativa: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-5 text-[15px] font-bold ${
      ativa ? "border-verde-700 bg-verde-700 text-white" : "border-cinza-300 bg-white text-tinta hover:bg-verde-050"
    }`;
  return (
    <nav aria-label="O que explorar" className="flex flex-wrap gap-2">
      <Link href="/licitacoes/explorar" aria-current={aba === "licitacoes" ? "page" : undefined} className={classe(aba === "licitacoes")}>
        Licitações
      </Link>
      <Link href="/licitacoes/explorar?aba=obras" aria-current={aba === "obras" ? "page" : undefined} className={classe(aba === "obras")}>
        Obras
      </Link>
    </nav>
  );
}

type Opcoes = {
  entidades: { slug: string; curto: string; n: number; principal: boolean }[];
  modalidades: { valor: string; n: number }[];
  gestoes: { valor: string; n: number }[];
  ufs: { valor: string; n: number }[];
  cidades: string[];
};

function Campo({ rotulo, children, largo }: { rotulo: string; children: ReactNode; largo?: boolean }) {
  return (
    <label className={`flex flex-col gap-1.5 text-[13px] font-semibold text-cinza-700 ${largo ? "min-w-64 flex-[2]" : "min-w-40 flex-1"}`}>
      {rotulo}
      {children}
    </label>
  );
}

export function FiltrosLicitacoes({ base, p, opcoes }: { base: string; p: ParametrosLicitacoes; opcoes: Opcoes }) {
  const temFiltro = !!(p.q || p.modalidade || p.gestao || p.cidade || p.uf || p.entidade || p.sinais || p.agrupar || p.ordem);
  return (
    <form action={base} className="flex flex-col gap-3 rounded-[14px] border border-linha bg-white p-4">
      {p.agrupar && <input type="hidden" name="agrupar" value={p.agrupar} />}
      <div className="flex flex-wrap items-end gap-3">
        <Campo rotulo="Buscar" largo>
          <input
            name="q"
            type="search"
            defaultValue={p.q}
            placeholder="objeto, empresa, cidade, secretaria, número…"
            className={campo}
          />
        </Campo>
        <Campo rotulo="Quem comprou">
          <select name="entidade" defaultValue={p.entidade ?? ""} className={campo}>
            {opcoes.entidades.map((e) => (
              <option key={e.slug} value={e.principal ? "" : e.slug}>
                {e.curto} ({formatarInteiro(e.n)})
              </option>
            ))}
            <option value="todas">Todas as entidades</option>
          </select>
        </Campo>
        <Campo rotulo="Sinais de risco">
          <select name="sinais" defaultValue={p.sinais ?? ""} className={campo}>
            <option value="">Todos</option>
            <option value="1">1 ou mais</option>
            <option value="2">2 ou mais</option>
            <option value="3">3 ou mais</option>
          </select>
        </Campo>
        <Campo rotulo="Modalidade">
          <select name="modalidade" defaultValue={p.modalidade ?? ""} className={campo}>
            <option value="">Todas</option>
            {opcoes.modalidades.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.valor} ({formatarInteiro(m.n)})
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Campo rotulo="Gestão">
          <select name="gestao" defaultValue={p.gestao ?? ""} className={campo}>
            <option value="">Todas</option>
            {opcoes.gestoes.map((g) => (
              <option key={g.valor} value={g.valor}>
                {rotuloGestao(g.valor)} ({formatarInteiro(g.n)})
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Cidade do fornecedor">
          <input name="cidade" list="cidades-fornecedor" defaultValue={p.cidade} className={campo} autoComplete="off" />
          <datalist id="cidades-fornecedor">
            {opcoes.cidades.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Campo>
        <Campo rotulo="UF do fornecedor">
          <select name="uf" defaultValue={p.uf ?? ""} className={campo}>
            <option value="">Todas</option>
            {opcoes.ufs.map((u) => (
              <option key={u.valor} value={u.valor}>
                {u.valor}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Ordem">
          <select name="ordem" defaultValue={p.ordem ?? "valor"} className={campo}>
            <option value="valor">Maior valor</option>
            <option value="recentes">Mais recentes</option>
          </select>
        </Campo>
        <div className="flex gap-2">
          <button className={botaoPrimario}>Filtrar</button>
          {temFiltro && (
            <Link href={base} className={botaoLimpar}>
              Limpar
            </Link>
          )}
        </div>
      </div>
    </form>
  );
}

function linhaVencedor(l: Licitacao) {
  const v = l.vencedores[0];
  if (!v) return "Vencedor ainda não publicado";
  const extra = l.vencedores.length > 1 ? ` e mais ${l.vencedores.length - 1}` : "";
  return `${nomeExibido(v)} · ${cidadeDe(v)}${extra}`;
}

function secretariaTexto(l: Licitacao) {
  if (!l.secretaria) return l.entidade.principal ? "Secretaria não informada" : l.entidade.curto;
  return l.secretaria.nome + (l.secretaria.outras ? ` e outras ${l.secretaria.outras}` : "");
}

const corSinais = (n: number) => (n >= 2 ? "text-alerta-800" : n === 1 ? "text-exemplo-texto" : "text-verde-800");
const rotuloSinais = (n: number) => (n === 0 ? "Nenhum sinal" : n === 1 ? "1 sinal" : `${n} sinais`);

function PontosSinais({ r }: { r: ResultadoSinais }) {
  return (
    <span className="flex items-center gap-2 text-[13px]">
      <span aria-hidden="true" className="flex gap-[3px]">
        {r.estados.map((e, i) => (
          <span key={i} className={`size-2.5 rounded-full ${e === "presente" ? "bg-alerta-700" : "bg-linha"}`} />
        ))}
      </span>
      <span className={`font-bold ${corSinais(r.presentes)}`}>{rotuloSinais(r.presentes)}</span>
    </span>
  );
}

export function ItemLicitacao({
  l,
  href,
  hrefCelular,
  selecionado,
  sinais,
}: {
  l: Licitacao;
  href: string;
  hrefCelular: string;
  selecionado: boolean;
  sinais?: ResultadoSinais;
}) {
  const conteudo = (
    <>
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[13px] text-cinza-600">
        <span>
          {l.modalidade} {l.numero} · {secretariaTexto(l)}
        </span>
        <span className="shrink-0">{l.gestao ? rotuloGestao(l.gestao) : ""}</span>
      </span>
      <span className="line-clamp-2 text-[17px] font-bold text-tinta">{l.objeto}</span>
      <span className="flex items-baseline justify-between gap-3 text-[14px] text-cinza-700">
        <span className="min-w-0 truncate">{linhaVencedor(l)}</span>
        <span className="shrink-0 font-bold text-tinta tabular-nums">
          {l.valorHomologado !== null ? formatarMoedaCurta(l.valorHomologado) : `estimado ${formatarMoedaCurta(l.valorEstimado)}`}
        </span>
      </span>
      {sinais && <PontosSinais r={sinais} />}
    </>
  );
  const classe = `flex min-w-0 flex-col gap-2 rounded-xl border-2 bg-white px-[18px] py-4 ${
    selecionado ? "border-verde-700" : "border-linha hover:border-verde-300"
  }`;
  return (
    <li>
      {/* Telas largas abrem a ficha ao lado; no celular, a ficha é uma página própria. */}
      <Link href={href} scroll={false} aria-current={selecionado ? "true" : undefined} className={`${classe} max-lg:hidden`}>
        {conteudo}
      </Link>
      <Link href={hrefCelular} className={`${classe} lg:hidden`}>
        {conteudo}
      </Link>
    </li>
  );
}

export function AgregadoCidades({ ls, base, p }: { ls: Licitacao[]; base: string; p: ParametrosLicitacoes }) {
  const cidades = porCidade(ls);
  const total = cidades.reduce((t, c) => t + c.valor, 0);
  return (
    <div className="overflow-x-auto rounded-[14px] border border-linha bg-white">
      <table className="w-full min-w-[560px] text-left text-[15px]">
        <caption className="sr-only">Valor homologado por cidade do fornecedor</caption>
        <thead className="bg-fundo-alt text-[13px] tracking-[.06em] text-cinza-600 uppercase">
          <tr>
            <th className="px-3 py-2">Cidade do fornecedor</th>
            <th className="px-3 py-2">Origem</th>
            <th className="px-3 py-2 text-right">Valor</th>
            <th className="px-3 py-2 text-right">Fatia</th>
            <th className="px-3 py-2 text-right">Licitações</th>
            <th className="px-3 py-2 text-right">Empresas</th>
          </tr>
        </thead>
        <tbody>
          {cidades.map((c) => (
            <tr key={c.cidade} className="border-t border-linha">
              <td className="px-3 py-2">
                {c.municipio ? (
                  <Link
                    className="font-semibold text-verde-700 underline underline-offset-2"
                    href={urlLicitacoes(base, p, { agrupar: undefined, cidade: c.municipio, uf: c.uf ?? undefined })}
                  >
                    {c.cidade}
                  </Link>
                ) : (
                  c.cidade
                )}
              </td>
              <td className="px-3 py-2">
                <Pill tom={tomOrigem(c.origem)}>{rotuloOrigem(c.origem)}</Pill>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(c.valor)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{total ? `${((c.valor / total) * 100).toFixed(1).replace(".", ",")}%` : "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatarInteiro(c.licitacoes)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatarInteiro(c.fornecedores)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ——— Ficha ———

const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`;

function mesesEntre(a: string, b: string) {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma) - (db < da ? 1 : 0);
}

function idadeEmpresa(v: Vencedor, l: Licitacao): string | null {
  if (!v.dataAbertura || !l.dataAbertura) return null;
  const m = mesesEntre(v.dataAbertura, l.dataAbertura);
  if (m < 0) return "aberta depois da disputa";
  if (m < 24) return `aberta ${m} ${m === 1 ? "mês" : "meses"} antes da disputa`;
  const anos = Math.floor(m / 12);
  return `empresa aberta há ${anos} anos na data da disputa`;
}

function Numero({ rotulo, valor, tom, nota }: { rotulo: string; valor: string; tom?: "alerta" | "bom"; nota?: string }) {
  const cor = tom === "alerta" ? "text-alerta-800" : tom === "bom" ? "text-verde-800" : "text-tinta";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] text-cinza-600">{rotulo}</span>
      <strong className={`text-[18px] leading-tight font-bold [overflow-wrap:anywhere] tabular-nums ${cor}`}>{valor}</strong>
      {nota && <span className="text-[13px] text-cinza-600">{nota}</span>}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-[16px] font-bold text-tinta">{titulo}</h3>
      {children}
    </section>
  );
}

const ROTULO_ESTADO: Record<EstadoSinal, string> = {
  presente: "Presente",
  ausente: "Ausente",
  "sem-informacao": "Sem informação",
  "nao-se-aplica": "Não se aplica",
};

function IconeSinal({ e }: { e: EstadoSinal }) {
  const comum = { width: 18, height: 18, viewBox: "0 0 24 24", role: "img", "aria-label": ROTULO_ESTADO[e], className: "mt-0.5 shrink-0" } as const;
  if (e === "presente")
    return (
      <svg {...comum} fill="var(--fz-alerta-700)">
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  if (e === "sem-informacao")
    return (
      <svg {...comum} fill="none" stroke="var(--fz-cinza-400)" strokeWidth="2" strokeDasharray="3 3">
        <circle cx="12" cy="12" r="8" />
      </svg>
    );
  return (
    <svg {...comum} fill="none" stroke={e === "ausente" ? "var(--fz-cinza-300)" : "var(--fz-cinza-200)"} strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

function SinaisDeRisco({ r }: { r: ResultadoSinais }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-[16px] font-bold text-tinta">
        Sinais de risco: <span className={corSinais(r.presentes)}>{r.presentes} de 7</span>
      </h3>
      <ul className="flex flex-col gap-2">
        {SINAIS.map((d, i) => {
          const e = r.estados[i];
          return (
            <li key={d.id} className="flex items-start gap-2.5 text-[14px]">
              <IconeSinal e={e} />
              <span className="flex flex-col gap-0.5">
                <span className={e === "presente" ? "font-bold text-tinta" : "text-cinza-600"}>
                  {d.titulo}
                  {e === "sem-informacao" && <span className="text-[13px]"> · sem informação</span>}
                  {e === "nao-se-aplica" && <span className="text-[13px]"> · não se aplica</span>}
                </span>
                {e === "presente" && <span className="text-[13px] text-cinza-600">Pode ter explicação: {d.explicacao}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <Link href="/licitacoes/metodologia#sinais" className="self-start text-[14px] font-semibold text-verde-700 hover:text-verde-800">
        Como cada sinal é calculado
      </Link>
    </section>
  );
}

function NoPncp({ l, c }: { l: Licitacao; c: CasamentoPncp }) {
  if (c.estado !== "achada")
    return (
      <Secao titulo="No portal nacional (PNCP)">
        <p className="text-[15px] text-cinza-700">
          {c.estado === "sem-chave"
            ? "O TCE-PR não informou o número do processo desta licitação, então não dá para procurá-la no PNCP."
            : c.estado === "ambigua"
              ? `Há ${c.candidatos} compras no PNCP com o processo ${l.processo}; não dá para saber qual é esta.`
              : `Não encontramos no PNCP nenhuma compra da prefeitura com o processo ${l.processo}.`}
        </p>
      </Secao>
    );
  const p = c.compra;
  return (
    <Secao titulo="No portal nacional (PNCP)">
      <p className="text-[15px]">
        {p.publicadoEm ? `Publicada em ${formatarData(p.publicadoEm)}` : "Publicada"}
        {p.aberturaPropostas ? ` · propostas a partir de ${formatarData(p.aberturaPropostas)}` : ""}
        {p.encerramentoPropostas ? ` até ${formatarData(p.encerramentoPropostas)}` : ""}
        {p.situacao ? ` · ${p.situacao}` : ""}.
      </p>
      {p.documentos.length > 0 ? (
        <ul className="flex flex-col divide-y divide-linha rounded-xl border border-linha">
          {p.documentos.map((d) => (
            <li key={d.url} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2 text-[15px]">
              <a href={d.url} target="_blank" rel="noreferrer" className="font-semibold text-verde-700 underline underline-offset-2">
                {d.tipo}
                <span className="sr-only"> (abre o documento no PNCP)</span>
              </a>
              <span className="text-[13px] text-cinza-600">{d.publicadoEm ? formatarData(d.publicadoEm) : ""}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[15px] text-cinza-700">Nenhum documento publicado no PNCP.</p>
      )}
    </Secao>
  );
}

export function FichaLicitacao({
  l,
  fontes,
  sinais,
  titulo = "h2",
}: {
  l: Licitacao;
  fontes: FonteDado[];
  sinais?: ResultadoSinais | null;
  titulo?: "h1" | "h2";
}) {
  const Titulo = titulo;
  const pncp = l.pncp;
  const principal = l.vencedores[0];
  const estimado = l.valorEstimadoItensVencidos;
  const desconto = l.valorHomologado !== null && estimado ? 1 - l.valorHomologado / estimado : null;
  const competitiva = MODALIDADES_COMPETITIVAS.has(l.modalidade);
  const itensMarcados = l.itens.filter((i) => i.divididoEntre > 1 || i.valorPublicadoComoTotal).length;

  return (
    <article className="@container flex min-w-0 flex-col gap-[22px] overflow-hidden rounded-2xl border border-verde-borda bg-white">
      <header className="flex flex-col gap-2 bg-verde-050 px-6 py-[22px]">
        <p className="text-[13px] font-bold text-verde-800">
          {l.modalidade} {l.numero} · {secretariaTexto(l)}
          {l.gestao ? ` · gestão ${rotuloGestao(l.gestao)}` : ""}
        </p>
        <Titulo className="text-[22px] leading-[1.25] font-extrabold text-tinta">{l.objeto}</Titulo>
        {principal ? (
          <p className="text-[14px] text-cinza-700">
            {l.vencedores.length > 1 ? "Vencedoras: " : "Vencedora: "}
            <strong className="text-tinta">{nomeExibido(principal)}</strong> ({cidadeDe(principal)})
            {idadeEmpresa(principal, l) ? ` · ${idadeEmpresa(principal, l)}` : ""}
            {l.vencedores.length > 1 ? ` e mais ${l.vencedores.length - 1}` : ""}
          </p>
        ) : (
          <p className="text-[14px] text-cinza-700">O TCE-PR ainda não publicou o vencedor desta licitação.</p>
        )}
        <p className="text-[13px] text-cinza-600">
          {l.entidade.curto} · Situação: {l.situacao}
          {l.dataEdital ? ` · Edital ${formatarData(l.dataEdital)}` : ""}
          {l.dataAbertura ? ` · Abertura ${formatarData(l.dataAbertura)}` : ""}
          {l.dataHomologacao ? ` · Homologação ${formatarData(l.dataHomologacao)}` : ""}
        </p>
      </header>

      <div className="flex flex-col gap-[22px] px-6">
        {l.valorHomologado !== null && estimado ? (
          <div className="grid grid-cols-2 gap-3 @md:grid-cols-3">
            <Numero
              rotulo="Preço estimado"
              valor={formatarMoeda(estimado)}
              nota={
                Math.abs(estimado - l.valorEstimado) > 1
                  ? `dos itens com vencedor; estimado total da licitação: ${formatarMoeda(l.valorEstimado)}`
                  : undefined
              }
            />
            <Numero rotulo="Preço contratado" valor={formatarMoeda(l.valorHomologado)} nota="soma dos itens vencidos" />
            <Numero
              rotulo="Desconto obtido"
              valor={desconto !== null ? pct(desconto) : "—"}
              tom={desconto === null ? undefined : desconto <= 0.02 ? "alerta" : "bom"}
              nota={desconto !== null && desconto <= 0.02 ? "Pouco ou nenhum desconto sobre o estimado." : undefined}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 @md:grid-cols-3">
            <Numero rotulo="Preço estimado" valor={formatarMoeda(l.valorEstimado)} />
          </div>
        )}

        {sinais && <SinaisDeRisco r={sinais} />}

        <Secao titulo="Quem disputou">
          <p className="text-[15px]">
            {l.participantes === null
              ? "O TCE-PR não publicou os participantes desta licitação."
              : `${formatarInteiro(l.participantes)} ${l.participantes === 1 ? "participante" : "participantes"}${
                  competitiva ? "" : ` (${l.modalidade.toLowerCase()}: não há disputa aberta)`
                }.`}
          </p>
          {l.vencedores.length > 1 && (
            <ul className="flex flex-col divide-y divide-linha rounded-xl border border-linha">
              {l.vencedores.map((v) => (
                <li key={v.doc || v.nome} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2 text-[15px]">
                  <span>
                    <strong>{nomeExibido(v)}</strong> · {cidadeDe(v)} <Pill tom={tomOrigem(v.origem)}>{rotuloOrigem(v.origem)}</Pill>
                  </span>
                  <span className="tabular-nums">{formatarMoeda(v.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        {l.itens.length > 0 && (
          <Secao titulo={`Itens vencidos (${formatarInteiro(l.itens.length)})`}>
            <div className="max-h-96 overflow-auto rounded-xl border border-linha">
              <table className="w-full min-w-[640px] text-left text-[14px]">
                <caption className="sr-only">Itens vencidos com preço máximo e valor</caption>
                <thead className="sticky top-0 bg-fundo-alt text-[13px] tracking-[.06em] text-cinza-600 uppercase">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Qtd.</th>
                    <th className="px-3 py-2 text-right">Preço máximo unit.</th>
                    <th className="px-3 py-2 text-right">Valor vencido</th>
                  </tr>
                </thead>
                <tbody>
                  {l.itens.map((i, n) => (
                    <tr key={n} className="border-t border-linha align-top">
                      <td className="px-3 py-2">
                        <span className="line-clamp-3">{i.descricao}</span>
                        {(i.divididoEntre > 1 || i.valorPublicadoComoTotal) && (
                          <span className="mt-1 block text-[13px] text-cinza-600">
                            {i.divididoEntre > 1 ? `Dividido igualmente entre ${i.divididoEntre} vencedores.` : ""}
                            {i.valorPublicadoComoTotal ? " Valor publicado tratado como total do item." : ""}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {i.quantidade.toLocaleString("pt-BR")} {i.unidade === "Unidade" ? "un." : ""}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(i.precoMaximoUnitario)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(i.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {itensMarcados > 0 && (
              <p className="text-[14px] text-cinza-600">
                {formatarInteiro(itensMarcados)} {itensMarcados === 1 ? "item teve" : "itens tiveram"} o valor ajustado. Veja como na{" "}
                <Link href="/licitacoes/metodologia" className="text-verde-700 underline underline-offset-2">
                  metodologia
                </Link>
                .
              </p>
            )}
          </Secao>
        )}

        {l.contratos.length > 0 && (
          <Secao titulo="Contratos e atas">
            <ul className="flex flex-col divide-y divide-linha rounded-xl border border-linha">
              {l.contratos.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2 text-[15px]">
                  <span>
                    {c.ato.trim()} {c.numero} · {c.contratado}
                    {c.inicio ? ` · ${formatarData(c.inicio)} a ${formatarData(c.fim)}` : ""}
                  </span>
                  <span className="tabular-nums">{formatarMoeda(c.valor)}</span>
                </li>
              ))}
            </ul>
          </Secao>
        )}

        <NoPncp l={l} c={pncp} />

        <div className="flex flex-wrap gap-2">
          {pncp?.estado === "achada" && (
            <a href={pncp.compra.url} target="_blank" rel="noreferrer" className={botaoPrimario}>
              Ver no PNCP <span className="sr-only">(abre o portal nacional em nova aba)</span>
            </a>
          )}
          <Link href={`/${l.ano}/licitacoes/${l.id}`} className={pncp?.estado === "achada" ? botaoSecundario : botaoPrimario}>
            Ver o registro no TCE-PR
          </Link>
          <a href={URL_LAI} target="_blank" rel="noreferrer" className={botaoSecundario}>
            Pedir documentos (LAI) <span className="sr-only">(abre o site da prefeitura em nova aba)</span>
          </a>
        </div>
      </div>

      <footer className="flex flex-col gap-2 border-t border-cinza-100 px-6 py-4 text-[13px] leading-normal text-cinza-600">
        <p>
          Sinais indicam onde vale perguntar, não irregularidade. A empresa ou a prefeitura podem enviar esclarecimentos, que serão
          publicados nesta ficha.
        </p>
        <p>
          Fontes:{" "}
          {fontes.map((f, i) => (
            <span key={f.nome}>
              {i > 0 && " · "}
              {f.url ? (
                <a href={f.url} className="underline underline-offset-2" target="_blank" rel="noreferrer">
                  {f.nome}
                </a>
              ) : (
                f.nome
              )}
              {f.atualizado_em ? ` (atualizado em ${formatarData(f.atualizado_em)})` : ""}
            </span>
          ))}
          . Remessas do SIM-AM até {l.fonte.ultimoEnvio || "—"}.
        </p>
      </footer>
    </article>
  );
}

