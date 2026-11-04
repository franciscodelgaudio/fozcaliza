// Aba Obras do explorador: filtros, item da lista e ficha (seção "Explorar" do design).
// Sem % executado oficial: mostra situação declarada, prazo passado, meses sem medição
// e % pago do contrato; o % físico só aparece quando o Obrasgov.br publica.

import Link from "next/link";
import type { ReactNode } from "react";
import { URL_LAI } from "@/components/fz/licitacoes";
import { formatarData, formatarMoeda, formatarMoedaCurta } from "@/lib/formato";
import { urlObras, type ParametrosObras } from "@/lib/obras/consulta";
import { MESES_SEM_MEDICAO, ROTULO_ALERTA, type Alerta, type Obra } from "@/lib/obras/modelo";

const campo = "min-h-11 w-full rounded-[10px] border border-cinza-300 bg-white px-3 text-[15px] text-tinta focus-visible:border-verde-700";
const botaoPrimario =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] bg-verde-700 px-4 text-[15px] font-bold text-white hover:bg-verde-800";
const botaoSecundario =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] border border-cinza-300 bg-white px-4 text-[15px] font-semibold text-verde-700 hover:bg-verde-050";

const pct = (f: number) => `${Math.round(f * 100)}%`;
const mesAno = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

const TOM: Record<Alerta, string> = {
  paralisada: "bg-alerta-100 text-alerta-800",
  "sem-medicao": "bg-alerta-100 text-alerta-800",
  "prazo-vencido": "bg-alerta-100 text-alerta-800",
  "em-dia": "bg-verde-100 text-verde-800",
  "nao-iniciada": "bg-cinza-100 text-cinza-700",
  concluida: "bg-verde-100 text-verde-800",
  cancelada: "bg-cinza-100 text-cinza-700",
};

export function PilulaAlerta({ o }: { o: Obra }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <span className={`rounded-full px-[9px] py-1 text-[12px] font-bold ${TOM[o.alerta]}`}>{ROTULO_ALERTA[o.alerta]}</span>
      {o.desatualizada && (
        <span className="rounded-full bg-exemplo px-[9px] py-1 text-[12px] font-bold text-exemplo-texto">Informação de {mesAno(o.referencia)}</span>
      )}
    </span>
  );
}

function Barra({ rotulo, valor, cor, texto, grande }: { rotulo: string; valor: number | null; cor: string; texto?: string; grande?: boolean }) {
  return (
    <>
      <span className="text-cinza-700">{rotulo}</span>
      <span className={`block overflow-hidden rounded-[3px] bg-cinza-100 ${grande ? "h-4" : "h-2.5"}`}>
        {valor !== null && <span className="block h-full" style={{ width: `${Math.min(100, valor * 100)}%`, background: cor }} />}
      </span>
      <span className="text-right font-bold tabular-nums">{texto ?? (valor === null ? "—" : pct(valor))}</span>
    </>
  );
}

export function FiltrosObras({ p }: { p: ParametrosObras }) {
  const temFiltro = !!(p.q || p.alerta || p.periodo || p.entidade);
  return (
    <form action="/licitacoes/explorar" className="flex flex-wrap items-end gap-3 rounded-[14px] border border-linha bg-white p-4">
      <input type="hidden" name="aba" value="obras" />
      <label className="flex min-w-64 flex-[2] flex-col gap-1.5 text-[13px] font-semibold text-cinza-700">
        Buscar
        <input name="q" type="search" defaultValue={p.q} placeholder="obra, bairro, empresa ou contrato" className={campo} />
      </label>
      <label className="flex min-w-44 flex-1 flex-col gap-1.5 text-[13px] font-semibold text-cinza-700">
        Situação
        <select name="alerta" defaultValue={p.alerta ?? ""} className={campo}>
          <option value="">Todas</option>
          {(["paralisada", "sem-medicao", "prazo-vencido", "em-dia", "nao-iniciada"] as Alerta[]).map((a) => (
            <option key={a} value={a}>
              {ROTULO_ALERTA[a]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-44 flex-1 flex-col gap-1.5 text-[13px] font-semibold text-cinza-700">
        Quais obras
        <select name="periodo" defaultValue={p.periodo ?? "ativas"} className={campo}>
          <option value="ativas">Não concluídas</option>
          <option value="concluidas">Concluídas</option>
          <option value="todas">Todas</option>
        </select>
      </label>
      <label className="flex min-w-44 flex-1 flex-col gap-1.5 text-[13px] font-semibold text-cinza-700">
        Quem contratou
        <select name="entidade" defaultValue={p.entidade ?? ""} className={campo}>
          <option value="">Prefeitura</option>
          <option value="todas">Todas as entidades</option>
        </select>
      </label>
      <div className="flex gap-2">
        <button className={botaoPrimario}>Filtrar</button>
        {temFiltro && (
          <Link href="/licitacoes/explorar?aba=obras" className={botaoSecundario}>
            Limpar
          </Link>
        )}
      </div>
    </form>
  );
}

export function ItemObra({ o, p, selecionada }: { o: Obra; p: ParametrosObras; selecionada: boolean }) {
  const conteudo = (
    <>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[17px] font-bold text-tinta">{o.nome}</span>
        <PilulaAlerta o={o} />
      </span>
      <span className="text-[14px] text-cinza-700">
        {[o.bairro, o.contrato?.contratado, formatarMoedaCurta(o.valor), o.inicio ? `início ${formatarData(o.inicio)}` : null]
          .filter(Boolean)
          .join(" · ")}
      </span>
      <span className="grid grid-cols-[96px_1fr_44px] items-center gap-2 text-[13px]">
        <Barra rotulo="Prazo passado" valor={o.prazoPassado} cor="var(--fz-cinza-400)" texto={o.prazoPassado === null ? "—" : pct(o.prazoPassado)} />
        <Barra rotulo="Pago" valor={o.contrato?.pago ?? null} cor="var(--fz-verde-700)" />
      </span>
    </>
  );
  const classe = `flex min-w-0 flex-col gap-2.5 rounded-xl border-2 bg-white px-[18px] py-4 ${
    selecionada ? "border-verde-700" : "border-linha hover:border-verde-300"
  }`;
  return (
    <li>
      <Link href={urlObras(p, { sel: o.id })} scroll={false} aria-current={selecionada ? "true" : undefined} className={`${classe} max-lg:hidden`}>
        {conteudo}
      </Link>
      <Link href={`/obras/${o.id}`} className={`${classe} lg:hidden`}>
        {conteudo}
      </Link>
    </li>
  );
}

function leitura(o: Obra): string {
  const pago = o.contrato ? ` ${pct(o.contrato.pago)} do contrato já foi pago.` : "";
  const med = o.ultimaMedicao ? ` A última medição foi em ${formatarData(o.ultimaMedicao)}.` : " Nenhuma medição foi informada.";
  switch (o.alerta) {
    case "paralisada":
      return `A prefeitura declarou ao TCE-PR que a obra está paralisada.${med}${pago}`;
    case "sem-medicao":
      return o.mesesSemMedicao !== null
        ? `Declarada em andamento, mas sem medição há ${o.mesesSemMedicao} meses.${pago}`
        : `Declarada em andamento, mas nenhuma medição foi informada desde o início.${pago}`;
    case "prazo-vencido":
      return `O prazo terminou em ${formatarData(o.fimPrevisto ?? "")} e a obra continua em andamento.${med}${pago}`;
    case "em-dia":
      return `Já passou ${pct(o.prazoPassado ?? 0)} do prazo.${med}${pago}`;
    case "nao-iniciada":
      return `A obra ainda não começou.${pago}`;
    case "concluida":
      return `A prefeitura declarou a obra como concluída.${pago}`;
    default:
      return `Situação declarada: ${o.situacao}.`;
  }
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] font-semibold text-cinza-600">{rotulo}</dt>
      <dd className="mt-0.5 text-[15px]">{children}</dd>
    </div>
  );
}

export function FichaObra({ o, titulo = "h2" }: { o: Obra; titulo?: "h1" | "h2" }) {
  const Titulo = titulo;
  const c = o.contrato;
  const mapa = o.coordenadas ? `https://www.google.com/maps/search/?api=1&query=${o.coordenadas.lat.toFixed(6)},${o.coordenadas.lon.toFixed(6)}` : null;
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-verde-borda bg-white">
      <header className="flex flex-col gap-2 bg-verde-050 px-6 py-[22px]">
        <p className="text-[13px] font-bold text-verde-800">
          {[o.bairro, o.entidade, c ? `Contrato ${c.numero}` : null].filter(Boolean).join(" · ")}
        </p>
        <Titulo className="text-[22px] leading-[1.25] font-extrabold text-tinta">{o.nome}</Titulo>
        <p className="text-[14px] text-cinza-700">
          {[c?.contratado, formatarMoeda(o.valor), o.fimPrevisto ? `prazo final ${formatarData(o.fimPrevisto)}` : null].filter(Boolean).join(" · ")}
        </p>
      </header>

      <div className="flex flex-col gap-[22px] px-6 py-[22px]">
        <div className="flex flex-col gap-2.5">
          <PilulaAlerta o={o} />
          <div className="grid grid-cols-[130px_1fr_48px] items-center gap-2.5 text-[14px]">
            <Barra rotulo="Prazo que passou" valor={o.prazoPassado} cor="var(--fz-cinza-400)" grande />
            <Barra rotulo="Contrato pago" valor={c?.pago ?? null} cor="var(--fz-verde-700)" grande />
            {o.federal?.percentual !== null && o.federal?.percentual !== undefined && (
              <Barra rotulo="Obra feita (Obrasgov)" valor={o.federal.percentual / 100} cor="var(--fz-verde-900)" grande />
            )}
          </div>
          <p className="text-[15px] leading-normal">{leitura(o)}</p>
          {o.desatualizada && (
            <p className="rounded-[10px] bg-exemplo px-3 py-2 text-[14px] text-exemplo-texto">
              O TCE-PR não atualiza esta informação desde {mesAno(o.referencia)}. A situação real pode ser outra.
            </p>
          )}
        </div>

        <dl className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-6 gap-y-3">
          <Dado rotulo="Situação declarada">{o.situacao}</Dado>
          <Dado rotulo="Início">{o.inicio ? formatarData(o.inicio) : "—"}</Dado>
          <Dado rotulo="Prazo">{o.prazoDias ? `${o.prazoDias} dias` : "—"}</Dado>
          <Dado rotulo="Última medição">{o.ultimaMedicao ? formatarData(o.ultimaMedicao) : "Nenhuma informada"}</Dado>
          <Dado rotulo="Informação até">{mesAno(o.referencia)}</Dado>
          {o.endereco && <Dado rotulo="Local">{o.endereco}</Dado>}
        </dl>

        <section className="flex flex-col gap-2.5">
          <h3 className="text-[16px] font-bold">Contrato e pagamentos</h3>
          {c ? (
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-6 gap-y-3">
              <Dado rotulo="Contrato">
                {c.numero} · assinado em {c.assinatura ? formatarData(c.assinatura) : "—"}
              </Dado>
              <Dado rotulo="Valor inicial">{formatarMoeda(c.valorInicial)}</Dado>
              <Dado rotulo={c.aditivos ? `Valor atual (${c.aditivos} ${c.aditivos === 1 ? "aditivo" : "aditivos"})` : "Valor atual"}>
                {formatarMoeda(c.valorAtual)}
              </Dado>
              <Dado rotulo="Liquidado (medições pagas)">{formatarMoeda(c.liquidado)}</Dado>
            </dl>
          ) : (
            <p className="text-[15px] text-cinza-700">
              {o.contratosAmbiguos
                ? `Há ${o.contratosAmbiguos} contratos com o mesmo valor da obra; não dá para saber qual é o dela.`
                : o.ano < 2022
                  ? "Os pagamentos de obras anteriores a 2022 ainda não foram baixados."
                  : "Nenhum contrato com o valor exato da obra foi encontrado no TCE-PR."}
            </p>
          )}
          <p className="text-[13px] leading-normal text-cinza-600">
            O TCE-PR não publica quanto da obra foi feito. “Contrato pago” é o que já foi liquidado, o que normalmente acontece depois de
            cada medição. Não é a mesma coisa que obra feita.
          </p>
        </section>

        {o.federal && (
          <section className="flex flex-col gap-2.5">
            <h3 className="text-[16px] font-bold">No Obrasgov.br (recurso federal)</h3>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-6 gap-y-3">
              <Dado rotulo="Situação no Obrasgov">{o.federal.situacao}</Dado>
              <Dado rotulo="Execução física">
                {o.federal.percentual !== null ? `${o.federal.percentual.toLocaleString("pt-BR")}%` : "Não informada"}
              </Dado>
              {o.federal.atualizadoEm && <Dado rotulo="Atualizado em">{formatarData(o.federal.atualizadoEm)}</Dado>}
              <Dado rotulo="Projeto">{o.federal.id}</Dado>
            </dl>
            {o.federal.paralisacao && <p className="text-[14px] text-cinza-700">Paralisação registrada: {o.federal.paralisacao}</p>}
          </section>
        )}

        <div className="flex flex-wrap gap-2.5">
          {mapa && (
            <a href={mapa} target="_blank" rel="noreferrer" className={botaoPrimario}>
              Ver no mapa <span className="sr-only">(abre o Google Maps em nova aba)</span>
            </a>
          )}
          <a href={URL_LAI} target="_blank" rel="noreferrer" className={botaoSecundario}>
            Pedir documentos (LAI) <span className="sr-only">(abre o site da prefeitura em nova aba)</span>
          </a>
        </div>
      </div>

      <footer className="flex flex-col gap-1 border-t border-cinza-100 px-6 py-4 text-[13px] leading-normal text-cinza-600">
        <p>
          Fonte: TCE-PR, cadastro de obras do SIM-AM (informado pela própria prefeitura){o.federal ? " e Obrasgov.br" : ""}. “Sem medição” e
          “prazo vencido” são leituras do Fozcaliza: {MESES_SEM_MEDICAO} meses ou mais sem medição, ou prazo original encerrado.{" "}
          <Link href="/licitacoes/metodologia#obras" className="underline underline-offset-2">
            Como calculamos
          </Link>
          .
        </p>
      </footer>
    </article>
  );
}
