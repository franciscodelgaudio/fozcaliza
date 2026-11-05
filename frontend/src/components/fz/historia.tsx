"use client";

// História guiada da seção Licitações.
// Desktop (lg+): painel fixo que avança com a rolagem, com setas.
// Celular e tablet: um cartão por passo, na altura do próprio conteúdo; o gráfico
// anima quando o cartão entra na tela. Nada fica sobreposto em tela baixa.
// Só entram passos com dado real; os números chegam prontos do servidor.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export type Segmento = {
  rotulo: string;
  fatia: string;
  valor: string;
  largura: number;
  cor: string;
};
export type Cidade = {
  nome: string;
  valor: string;
  largura: number;
  destaque: boolean;
  cor: string;
};
export type BarraDisputa = {
  rotulo: string;
  detalhe: string;
  pago: number;
  cor: string;
};
export type PontoObra = { cor: string };
export type LegendaObra = { cor: string; n: number; texto: string };
export type Visual = "total" | "origem" | "cidades" | "obras" | "disputa" | "fim";
export type Passo = {
  visual: Visual;
  kicker: string;
  lead: string;
  body: string;
  nota?: string;
  link?: { href: string; texto: string };
};

export type DadosHistoria = {
  total: string;
  subtitulo: string;
  segmentos: Segmento[];
  descricaoBarra: string;
  cidades: Cidade[];
  disputa: BarraDisputa[];
  obras: { pontos: PontoObra[]; legenda: LegendaObra[]; descricao: string };
  passos: Passo[];
  fonte: string;
};

const PX_POR_PASSO = 700;
const TOPO = 16;
const curva = "cubic-bezier(.22,.61,.36,1)";

function camada(ativa: boolean, avancando: boolean) {
  return {
    opacity: ativa ? 1 : 0,
    transform: `translateY(${ativa ? 0 : avancando ? 24 : -24}px)`,
    pointerEvents: ativa ? ("auto" as const) : ("none" as const),
    transition: `opacity 650ms ${curva}, transform 650ms ${curva}`,
  };
}

export function Historia({ d }: { d: DadosHistoria }) {
  return (
    <section id="historia" aria-label={`Explicação em ${d.passos.length} passos`} className="pt-8 sm:pt-12">
      <div className="lg:hidden">
        <Cartoes d={d} />
      </div>
      <div className="max-lg:hidden">
        <Painel d={d} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ gráficos */

function GraficoBarra({ d, origem }: { d: DadosHistoria; origem: boolean }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[40px] leading-none font-extrabold tracking-[-0.03em] text-verde-900 tabular-nums sm:text-[76px]">{d.total}</span>
        <span className="text-[15px] text-cinza-600 sm:text-[18px]">{d.subtitulo}</span>
      </div>
      <div
        role="img"
        aria-label={origem ? d.descricaoBarra : `${d.total} ${d.subtitulo}.`}
        className="flex h-14 shrink-0 overflow-hidden rounded-[14px] bg-cinza-100 sm:h-[180px]"
      >
        {d.segmentos.map((s, i) => (
          <div
            key={s.rotulo}
            className="h-full"
            style={{
              width: `${!origem ? (i === 0 ? 100 : 0) : s.largura}%`,
              background: !origem ? "var(--fz-verde-900)" : s.cor,
              transition: `width 900ms ${curva}, background 900ms ease`,
            }}
          />
        ))}
      </div>
    </>
  );
}

function LegendaOrigem({ d, visivel }: { d: DadosHistoria; visivel: boolean }) {
  return (
    <div
      className="grid grid-cols-2 gap-x-4 gap-y-3 sm:gap-x-6 sm:gap-y-3.5"
      style={{
        opacity: visivel ? 1 : 0,
        transform: `translateY(${visivel ? 0 : 12}px)`,
        transition: "opacity 600ms ease 250ms, transform 600ms ease 250ms",
      }}
    >
      {d.segmentos.map((s) => (
        <div key={s.rotulo} className="flex items-start gap-2.5">
          <span className="mt-[3px] size-3 shrink-0 rounded sm:size-4" style={{ background: s.cor }} />
          <div className="flex min-w-0 flex-col">
            <strong className="text-[14px] leading-snug sm:text-[16px]">
              {s.rotulo} · {s.fatia}
            </strong>
            <span className="text-[13px] text-cinza-600 tabular-nums sm:text-[14px]">{s.valor}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function GraficoCidades({ d, ativo }: { d: DadosHistoria; ativo: boolean }) {
  return (
    <>
      {d.cidades.map((c) => (
        <div key={c.nome} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[170px_1fr_110px] sm:gap-3.5">
          <span className={`truncate ${c.destaque ? "font-extrabold" : ""}`}>{c.nome}</span>
          <div className="col-span-2 row-start-2 h-2.5 overflow-hidden rounded-md bg-fundo-alt sm:col-span-1 sm:row-start-auto sm:h-9">
            <div
              className="h-full rounded-md"
              style={{
                width: `${ativo ? c.largura : 0}%`,
                background: c.cor,
                transition: `width 900ms ${curva}`,
              }}
            />
          </div>
          <span className={`text-right tabular-nums ${c.destaque ? "font-extrabold" : ""}`}>{c.valor}</span>
        </div>
      ))}
    </>
  );
}

function GraficoObras({ d, ativo }: { d: DadosHistoria; ativo: boolean }) {
  return (
    <>
      <div
        role="img"
        aria-label={d.obras.descricao}
        className="grid max-w-[700px] grid-cols-[repeat(10,minmax(0,1fr))] gap-1.5 sm:grid-cols-[repeat(12,minmax(0,1fr))] sm:gap-2.5"
      >
        {d.obras.pontos.map((pt, i) => (
          <div
            key={i}
            className="aspect-square rounded-full"
            style={{
              background: pt.cor,
              transform: `scale(${ativo ? 1 : 0.4})`,
              transition: `transform 700ms ease ${(i % 12) * 18 + Math.floor(i / 12) * 30}ms`,
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[14px] sm:gap-x-6 sm:text-[15px]">
        {d.obras.legenda.map((l) => (
          <span key={l.texto} className="flex items-center gap-2">
            <span className="size-3 shrink-0 rounded-full sm:size-4" style={{ background: l.cor }} />
            <span>
              <strong>{l.n}</strong> {l.texto}
            </span>
          </span>
        ))}
      </div>
    </>
  );
}

function GraficoDisputa({ d, ativo }: { d: DadosHistoria; ativo: boolean }) {
  return (
    <>
      <span className="text-[14px] text-cinza-600 sm:text-[15px]">Quanto foi pago, em relação ao preço que a própria prefeitura estimou</span>
      {d.disputa.map((b, i) => (
        <div
          key={b.rotulo}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,220px)_1fr_64px] sm:gap-3.5"
        >
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px] leading-snug font-semibold sm:text-[16px]">{b.rotulo}</span>
            <span className="text-[13px] text-cinza-600">{b.detalhe}</span>
          </span>
          <strong className="self-start text-right text-[16px] tabular-nums sm:order-last sm:self-center sm:text-[17px]">
            {Math.round(b.pago * 100)}%
          </strong>
          <div className="col-span-2 h-3 overflow-hidden rounded-lg bg-cinza-100 sm:col-span-1 sm:h-[52px]">
            <div
              className="h-full"
              style={{
                width: `${ativo ? Math.min(100, b.pago * 100) : 0}%`,
                background: b.cor,
                transition: `width 900ms ${curva} ${i * 120}ms`,
              }}
            />
          </div>
        </div>
      ))}
      <span className="text-[13px] text-cinza-600 sm:text-[14px]">100% = pagou exatamente o estimado, sem nenhum desconto.</span>
    </>
  );
}

function Acoes() {
  const secundario =
    "flex min-h-14 items-center justify-between gap-3 rounded-[14px] border border-verde-borda bg-white px-5 text-[16px] font-semibold text-verde-700 hover:bg-verde-050 sm:px-6 sm:text-[17px]";
  return (
    <>
      <Link
        href="/licitacoes/explorar"
        className="flex min-h-16 items-center justify-between gap-3 rounded-[14px] bg-verde-700 px-5 text-[17px] font-bold text-white hover:bg-verde-800 sm:px-6 sm:text-[18px]"
      >
        Buscar uma empresa, compra ou secretaria <span aria-hidden="true">→</span>
      </Link>
      <Link href="/licitacoes/explorar?agrupar=cidade" className={secundario}>
        Ver empresas por cidade <span aria-hidden="true">→</span>
      </Link>
      <Link href="/licitacoes/metodologia" className={secundario}>
        Como os números são calculados <span aria-hidden="true">→</span>
      </Link>
    </>
  );
}

/* ------------------------------------------------------- celular: cartões */

function Cartoes({ d }: { d: DadosHistoria }) {
  return (
    <ol className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 pb-6 sm:px-6">
      {d.passos.map((s, i) => (
        <Cartao key={s.kicker} d={d} s={s} i={i} />
      ))}
    </ol>
  );
}

/** Fica "ativo" (e anima o gráfico) na primeira vez que aparece na tela. */
function useVisto<T extends Element>() {
  const ref = useRef<T>(null);
  const [visto, setVisto] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visto) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setVisto(true);
      },
      { rootMargin: "0px 0px -25% 0px", threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visto]);
  return [ref, visto] as const;
}

function Cartao({ d, s, i }: { d: DadosHistoria; s: Passo; i: number }) {
  const n = d.passos.length;
  const [ref, visto] = useVisto<HTMLDivElement>();
  const fim = s.visual === "fim";

  return (
    <li className="overflow-hidden rounded-[18px] border border-verde-borda bg-white shadow-[0_6px_24px_rgba(10,77,48,0.06)]">
      <div className="flex flex-col gap-2.5 px-5 pt-5">
        <span className="text-[12px] font-extrabold tracking-[0.06em] text-verde-700 uppercase">
          Passo {i + 1} de {n} · {s.kicker}
        </span>
        <p className="text-[20px] leading-[1.3] font-bold tracking-[-0.01em]">{s.lead}</p>
        {fim && <p className="text-[16px] leading-normal text-cinza-700">{s.body}</p>}
      </div>

      <div ref={ref} className="flex flex-col gap-3.5 px-5 py-5 text-[15px]">
        {s.visual === "total" && <GraficoBarra d={d} origem={false} />}
        {s.visual === "origem" && (
          <>
            <GraficoBarra d={d} origem={visto} />
            <LegendaOrigem d={d} visivel={visto} />
          </>
        )}
        {s.visual === "cidades" && <GraficoCidades d={d} ativo={visto} />}
        {s.visual === "obras" && <GraficoObras d={d} ativo={visto} />}
        {s.visual === "disputa" && <GraficoDisputa d={d} ativo={visto} />}
        {fim && <Acoes />}
      </div>

      {!fim && (
        <div className="flex flex-col gap-3 border-t border-cinza-100 bg-fundo-painel px-5 py-4">
          <p className="text-[16px] leading-normal text-cinza-700">{s.body}</p>
          {s.nota && <p className="rounded-[10px] border border-linha bg-white px-3.5 py-3 text-[14px] leading-normal text-cinza-700">{s.nota}</p>}
          {s.link && (
            <Link
              href={s.link.href}
              className="inline-flex min-h-11 items-center self-start text-[15px] font-bold text-verde-700 hover:text-verde-800"
            >
              {s.link.texto} →
            </Link>
          )}
          <span className="self-start rounded-md bg-verde-100 px-[9px] py-[5px] text-[11px] font-extrabold tracking-[0.08em] text-verde-800 uppercase">
            Dado real · {d.fonte}
          </span>
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------- desktop: painel fixo */

function Painel({ d }: { d: DadosHistoria }) {
  const n = d.passos.length;
  const ref = useRef<HTMLDivElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  // Passo escolhido pelas setas: enquanto a rolagem suave não chega na faixa
  // dele, a rolagem não sobrescreve o passo (evita o vai-e-volta).
  const alvoRef = useRef<{ passo: number; timer: number } | null>(null);
  const [{ passo, avancando }, setEstado] = useState({
    passo: 0,
    avancando: true,
  });
  const [progresso, setProgresso] = useState(0);
  const setPasso = useCallback((k: number) => setEstado((e) => (e.passo === k ? e : { passo: k, avancando: k >= e.passo })), []);

  const medir = useCallback(() => {
    const el = ref.current;
    // Escondido (celular): nada a medir.
    if (!el || !el.offsetHeight) return null;
    const r = el.getBoundingClientRect();
    const painel = painelRef.current?.offsetHeight ?? window.innerHeight;
    return { r, faixa: Math.max(1, r.height - painel) };
  }, []);

  useEffect(() => {
    let raf = 0;
    const sync = () => {
      raf = 0;
      const m = medir();
      if (!m) return;
      const p = Math.max(0, Math.min(1, (TOPO - m.r.top) / m.faixa));
      setProgresso(p);
      const k = Math.min(n - 1, Math.floor(p * n));
      const alvo = alvoRef.current;
      if (alvo) {
        if (k !== alvo.passo) return;
        window.clearTimeout(alvo.timer);
        alvoRef.current = null;
      }
      setPasso(k);
    };
    const soltar = () => {
      if (!alvoRef.current) return;
      window.clearTimeout(alvoRef.current.timer);
      alvoRef.current = null;
    };
    const agendar = () => {
      if (!raf) raf = requestAnimationFrame(sync);
    };
    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar);
    // Se a pessoa rolar por conta própria no meio da animação, a rolagem volta a mandar.
    window.addEventListener("wheel", soltar, { passive: true });
    window.addEventListener("touchstart", soltar, { passive: true });
    sync();
    return () => {
      window.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
      window.removeEventListener("wheel", soltar);
      window.removeEventListener("touchstart", soltar);
      soltar();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [medir, n, setPasso]);

  const ir = (alvo: number) => {
    const k = Math.max(0, Math.min(n - 1, alvo));
    const m = medir();
    setPasso(k);
    if (!m) return;
    if (alvoRef.current) window.clearTimeout(alvoRef.current.timer);
    alvoRef.current = {
      passo: k,
      timer: window.setTimeout(() => (alvoRef.current = null), 1500),
    };
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: window.scrollY + m.r.top - TOPO + ((k + 0.5) / n) * m.faixa,
      behavior: reduzir ? "auto" : "smooth",
    });
  };

  const visual = d.passos[passo].visual;
  const fim = passo === n - 1;
  const real = visual !== "fim";
  const ativaBarra = visual === "total" || visual === "origem";
  const origem = visual === "origem";

  return (
    <div ref={ref} className="relative" style={{ height: n * PX_POR_PASSO }}>
      <div ref={painelRef} className="sticky top-4 mx-auto h-[calc(100svh-2rem)] min-h-[560px] max-w-[1440px] px-6">
        <div className="flex h-full flex-col overflow-hidden rounded-[22px] border border-verde-borda bg-white shadow-[0_10px_40px_rgba(10,77,48,0.08)]">
          <div aria-hidden="true" className="h-1 bg-cinza-100">
            <div className="h-1 bg-verde-700" style={{ width: `${(progresso * 100).toFixed(1)}%` }} />
          </div>

          <div className="flex min-h-0 flex-1">
            {/* Gráfico */}
            <div className="relative min-h-0 min-w-0 flex-[1.6_1_0%] border-r border-cinza-100 p-7">
              <div className="relative h-full">
                <div
                  aria-hidden={!ativaBarra}
                  className="absolute inset-0 flex flex-col justify-center gap-[22px]"
                  style={camada(ativaBarra, avancando)}
                >
                  <GraficoBarra d={d} origem={origem} />
                  <LegendaOrigem d={d} visivel={origem} />
                </div>
                <div
                  aria-hidden={visual !== "cidades"}
                  className="absolute inset-0 flex flex-col justify-center gap-4 text-[17px]"
                  style={camada(visual === "cidades", avancando)}
                >
                  <GraficoCidades d={d} ativo={visual === "cidades"} />
                </div>
                <div
                  aria-hidden={visual !== "obras"}
                  className="absolute inset-0 flex flex-col justify-center gap-[22px]"
                  style={camada(visual === "obras", avancando)}
                >
                  <GraficoObras d={d} ativo={visual === "obras"} />
                </div>
                <div
                  aria-hidden={visual !== "disputa"}
                  className="absolute inset-0 flex flex-col justify-center gap-[18px]"
                  style={camada(visual === "disputa", avancando)}
                >
                  <GraficoDisputa d={d} ativo={visual === "disputa"} />
                </div>
                <div aria-hidden={!fim} className="absolute inset-0 flex flex-col justify-center gap-3.5" style={camada(fim, avancando)}>
                  <Acoes />
                </div>
              </div>
            </div>

            {/* Texto */}
            <div className="relative min-h-0 min-w-0 flex-[1_1_0%] bg-fundo-painel p-8">
              <div aria-live="polite" className="relative h-full">
                {d.passos.map((s, i) => {
                  const ativo = i === passo;
                  return (
                    <article
                      key={s.kicker}
                      aria-hidden={!ativo}
                      className="absolute inset-0 flex flex-col justify-center gap-4"
                      style={{
                        opacity: ativo ? 1 : 0,
                        transform: `translateY(${ativo ? 0 : i < passo ? -20 : 20}px)`,
                        pointerEvents: ativo ? "auto" : "none",
                        transition: `opacity 650ms ${curva} ${ativo ? 120 : 0}ms, transform 650ms ${curva} ${ativo ? 120 : 0}ms`,
                      }}
                    >
                      <span className="text-[13px] font-extrabold tracking-[0.06em] text-verde-700 uppercase">
                        Passo {i + 1} de {n} · {s.kicker}
                      </span>
                      <p className="text-[25px] leading-[1.3] font-bold tracking-[-0.01em]">{s.lead}</p>
                      <p className="text-[18px] leading-[1.6] text-cinza-700">{s.body}</p>
                      {s.nota && (
                        <p className="rounded-[10px] border border-linha bg-white px-3.5 py-3 text-[14px] leading-normal text-cinza-700">{s.nota}</p>
                      )}
                      {s.link && (
                        <Link
                          href={s.link.href}
                          tabIndex={ativo ? undefined : -1}
                          className="self-start py-2 text-[15px] font-bold text-verde-700 hover:text-verde-800"
                        >
                          {s.link.texto} →
                        </Link>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-cinza-100 px-6 py-3.5">
            <span
              className={`rounded-md px-[9px] py-[5px] text-[11px] font-extrabold tracking-[0.08em] uppercase transition-colors duration-400 ${
                real ? "bg-verde-100 text-verde-800" : "bg-cinza-100 text-cinza-700"
              }`}
            >
              {real ? `Dado real · ${d.fonte}` : "Sua vez"}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => ir(passo - 1)}
                disabled={passo === 0}
                aria-label="Passo anterior"
                className="min-h-11 min-w-11 cursor-pointer rounded-[10px] border border-verde-borda bg-white text-[20px] text-tinta disabled:cursor-default disabled:opacity-40"
              >
                ‹
              </button>
              <div aria-hidden="true" className="flex items-center gap-1.5">
                {d.passos.map((s, i) => (
                  <span
                    key={s.kicker}
                    className="h-2 rounded"
                    style={{
                      width: i === passo ? 24 : 8,
                      background: i <= passo ? "var(--fz-verde-700)" : "var(--fz-cinza-200)",
                      transition: "width 400ms ease, background 400ms ease",
                    }}
                  />
                ))}
              </div>
              <span className="min-w-11 text-center text-[13px] text-cinza-600">
                {passo + 1} de {n}
              </span>
              <button
                type="button"
                onClick={() => ir(passo + 1)}
                disabled={fim}
                aria-label="Próximo passo"
                className="min-h-11 min-w-11 cursor-pointer rounded-[10px] border border-verde-700 bg-verde-700 text-[20px] text-white disabled:cursor-default disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
