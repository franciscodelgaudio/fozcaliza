// Obras públicas de Foz do Iguaçu a partir do cadastro de obras do SIM-AM (TCE-PR,
// arquivos Intervencao), de 2013 até o ano corrente, mais o "% pago" pelo contrato.
//
// Decisões (ver também a metodologia):
// - Situação é a declarada pela prefeitura ao TCE-PR. Arquivos de anos antigos deixam
//   de ser regerados; a "referência" de cada obra é a data da informação, e obras com
//   informação antiga são marcadas como desatualizadas em vez de supostas paradas.
// - O TCE-PR não publica % executado nem o contrato da obra. O contrato é achado pelo
//   valor exato (ao centavo), na mesma entidade; só vale se houver um único candidato.
// - "% pago" = liquidado nos empenhos do contrato ÷ valor atualizado do contrato
//   (último aditivo). Liquidação acontece depois da medição atestada, mas % pago não é
//   % feito: adiantamentos e medições atrasadas distorcem.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NOMES_CURTOS, capitalizar } from "@/lib/licitacoes/modelo";
import { anos, MUNICIPIO_IBGE6, PASTA_DADOS, PASTA_OBRAS, registros, texto, type Registro } from "@/lib/tce/dados";
import { obrasgovPorObra, type ObraFederal } from "./obrasgov";

export type Situacao = "Em andamento" | "Paralisada" | "Não iniciada" | "Concluída" | "Cancelada" | "Outra";

/** Leitura feita pelo site a partir da situação declarada, do prazo e das medições. */
export type Alerta = "paralisada" | "sem-medicao" | "prazo-vencido" | "em-dia" | "nao-iniciada" | "concluida" | "cancelada";

export type ContratoObra = {
  id: string;
  numero: string;
  ano: string;
  contratado: string;
  doc: string;
  assinatura: string | null;
  valorInicial: number;
  valorAtual: number;
  aditivos: number;
  liquidado: number;
  /** liquidado ÷ valor atual; pode passar de 1 se houve reajuste fora de aditivo. */
  pago: number;
};

export type Obra = {
  id: string;
  ano: number;
  entidade: string;
  principal: boolean;
  nome: string;
  valor: number;
  inicio: string | null;
  prazoDias: number | null;
  fimPrevisto: string | null;
  situacao: Situacao;
  regime: string;
  ultimaMedicao: string | null;
  /** Mês (AAAA-MM) até o qual a informação vale. */
  referencia: string;
  /** A informação parou de ser atualizada pelo TCE-PR (arquivo de ano antigo). */
  desatualizada: boolean;
  /** Fração do prazo já passada na data de referência. */
  prazoPassado: number | null;
  mesesSemMedicao: number | null;
  alerta: Alerta;
  endereco: string | null;
  bairro: string | null;
  coordenadas: { lat: number; lon: number } | null;
  contrato: ContratoObra | null;
  /** Candidatos com o mesmo valor quando o casamento foi ambíguo. */
  contratosAmbiguos: number;
  federal: ObraFederal | null;
};

/** Meses sem medição a partir dos quais uma obra "em andamento" é tratada como parada na prática. */
export const MESES_SEM_MEDICAO = 6;
const DIA = 86_400_000;

const SITUACOES: Record<string, Situacao> = {
  "em andamento": "Em andamento",
  paralisada: "Paralisada",
  "nao iniciada": "Não iniciada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const situacaoDe = (s: string): Situacao => SITUACOES[semAcento(s)] ?? "Outra";

const data = (v: string | undefined) => (v ? v.slice(0, 10) : null);
const mes = (v: string) => v.trim().replace("/", "-").slice(0, 7); // "2026/08" → "2026-08"
const fimDoMes = (m: string) => {
  const [a, n] = m.split("-").map(Number);
  return new Date(Date.UTC(a, n, 0)).toISOString().slice(0, 10);
};
const somarDias = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA;
function mesesEntre(a: string, b: string) {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma) - (db < da ? 1 : 0);
}

/** "25°34'56.4 Sul, 54°34'11.1 Oeste" → graus decimais. */
export function coordenadas(texto: string | undefined): { lat: number; lon: number } | null {
  if (!texto) return null;
  const partes = [...texto.matchAll(/(\d+)°\s*(\d+)'\s*([\d.,]+)"?\s*(Sul|Norte|Oeste|Leste|S|N|O|W|L|E)/gi)];
  if (partes.length !== 2) return null;
  const graus = (m: RegExpMatchArray) => {
    const v = Number(m[1]) + Number(m[2]) / 60 + Number(m[3].replace(",", ".")) / 3600;
    return /^(s|o|w)/i.test(m[4]) ? -v : v;
  };
  const lat = graus(partes[0]);
  const lon = graus(partes[1]);
  return Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0 ? { lat, lon } : null;
}

/** "CASTANHA DO PARA 0, , Conjunto habitacional Buba" → "Conjunto Habitacional Buba". */
function bairroDe(logradouro: string | undefined): string | null {
  const partes = (logradouro ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  return partes.length > 1 ? capitalizar(partes[partes.length - 1]) : null;
}

type Fonte = { ano: number; pasta: string };

/** Anos com cadastro de obras: recorte (tce-obras) e anos completos (tce); o completo prevalece. */
async function fontes(): Promise<Fonte[]> {
  const [recorte, completos] = await Promise.all([anos(PASTA_OBRAS), anos(PASTA_DADOS)]);
  const m = new Map<number, string>();
  for (const a of recorte) m.set(a, PASTA_OBRAS);
  for (const a of completos) m.set(a, PASTA_DADOS);
  return [...m].map(([ano, pasta]) => ({ ano, pasta })).sort((a, b) => a.ano - b.ano);
}

/** Liquidação líquida por empenho, lendo só os dois atributos (o arquivo tem ~16 MB por ano). */
async function liquidacoes(fs: Fonte[]): Promise<Map<string, number>> {
  const total = new Map<string, number>();
  const vistas = new Set<string>();
  const elemento = /<EmpenhoLiquidacao ([^>]*?)\/>/g;
  const attr = (s: string, n: string) => new RegExp(`\\b${n}="([^"]*)"`).exec(s)?.[1];
  for (const { ano, pasta } of fs) {
    let xml: string;
    try {
      xml = texto(await readFile(join(pasta, String(ano), `${ano}_${MUNICIPIO_IBGE6}_EmpenhoLiquidacao.xml`)));
    } catch {
      continue;
    }
    for (const m of xml.matchAll(elemento)) {
      const id = attr(m[1], "idLiquidacao");
      const emp = attr(m[1], "idEmpenho");
      if (!emp || (id && vistas.has(id))) continue;
      if (id) vistas.add(id);
      total.set(emp, (total.get(emp) ?? 0) + (Number(attr(m[1], "vlLiquidacaoLiquido")) || 0));
    }
  }
  return total;
}

/** Contratos achados por (entidade, valor em centavos). */
async function contratos(fs: Fonte[]) {
  const porValor = new Map<string, Registro[]>();
  const aditivos = new Map<string, Registro[]>();
  const empenhos = new Map<string, Set<string>>();
  const anosComContrato: number[] = [];
  for (const { ano, pasta } of fs) {
    const [cs, ads, exc] = await Promise.all([
      registros(ano, "Contrato", pasta),
      registros(ano, "ContratoAditivo", pasta),
      registros(ano, "EmpenhoXContrato", pasta),
    ]);
    if (cs.length) anosComContrato.push(ano);
    for (const c of cs) {
      const v = Math.round(Number(c.vlContrato) * 100);
      if (!v) continue;
      const k = `${c.idPessoa}|${v}`;
      const lista = porValor.get(k) ?? [];
      if (!lista.some((x) => x.idContrato === c.idContrato)) lista.push(c);
      porValor.set(k, lista);
    }
    for (const a of ads) {
      const lista = aditivos.get(a.idcontrato) ?? [];
      lista.push(a);
      aditivos.set(a.idcontrato, lista);
    }
    for (const x of exc) {
      if (!empenhos.has(x.idContrato)) empenhos.set(x.idContrato, new Set());
      empenhos.get(x.idContrato)!.add(x.idEmpenho);
    }
  }
  return { porValor, aditivos, empenhos, primeiroAno: Math.min(...anosComContrato) };
}

async function montar(): Promise<Obra[]> {
  const fs = await fontes();
  if (!fs.length) return [];
  const [ct, liq, federais] = await Promise.all([contratos(fs), liquidacoes(fs), obrasgovPorObra()]);
  const anoCorrente = fs[fs.length - 1];
  const envioCorrente = (await registros(anoCorrente.ano, "Intervencao", anoCorrente.pasta))[0]?.ultimoEnvioSIMAMNesteExercicio;
  const limite = envioCorrente && !envioCorrente.endsWith("/13") ? mes(envioCorrente) : null;

  const obras: Obra[] = [];
  for (const { ano, pasta } of fs) {
    const [rs, bens] = await Promise.all([registros(ano, "Intervencao", pasta), registros(ano, "IntervencaoBem", pasta)]);
    const bemPor = new Map<string, Registro>();
    for (const b of bens) if (!bemPor.has(b.idIntervencao)) bemPor.set(b.idIntervencao, b);

    for (const r of rs) {
      const situacao = situacaoDe(r.dsSituacao);
      const ref = r.DataReferencia ? mes(r.DataReferencia) : `${ano}-12`;
      const referencia = limite && ref > limite ? limite : ref;
      const dataRef = fimDoMes(referencia);
      // Só importa para obra não concluída: a situação pode ter mudado sem o TCE-PR saber.
      const desatualizada =
        !!limite && !["Concluída", "Cancelada"].includes(situacao) && mesesEntre(`${referencia}-01`, `${limite}-01`) > 3;

      const inicio = data(r.dtInicio);
      const prazoDias = Number(r.nrPrazoExecucao) || null;
      const fimPrevisto = inicio && prazoDias ? somarDias(inicio, prazoDias) : null;
      const prazoPassado = inicio && prazoDias ? Math.max(0, diasEntre(inicio, dataRef) / prazoDias) : null;
      const ultimaMedicao = data(r.dtUltimaMedicao);
      const mesesSemMedicao = ultimaMedicao ? Math.max(0, mesesEntre(ultimaMedicao, dataRef)) : null;

      let alerta: Alerta;
      if (situacao === "Concluída") alerta = "concluida";
      else if (situacao === "Cancelada") alerta = "cancelada";
      else if (situacao === "Paralisada") alerta = "paralisada";
      else if (situacao === "Não iniciada") alerta = "nao-iniciada";
      // Sem medição: desde a última medição, ou desde o início se nunca houve medição.
      else if ((mesesSemMedicao ?? (inicio ? mesesEntre(inicio, dataRef) : -1)) >= MESES_SEM_MEDICAO) alerta = "sem-medicao";
      else if (prazoPassado !== null && prazoPassado > 1) alerta = "prazo-vencido";
      else alerta = "em-dia";

      // Contrato: valor exato, mesma entidade, um único candidato, assinado até 60 dias depois do início.
      const valor = Number(r.vlIntervencao) || 0;
      const candidatos = (ct.porValor.get(`${r.idPessoa}|${Math.round(valor * 100)}`) ?? []).filter(
        (c) => !inicio || !c.dtAssinatura || diasEntre(c.dtAssinatura.slice(0, 10), inicio) >= -60,
      );
      let contrato: ContratoObra | null = null;
      if (candidatos.length === 1 && ano >= ct.primeiroAno) {
        const c = candidatos[0];
        const ads = (ct.aditivos.get(c.idContrato) ?? []).filter((a) => Number(a.vlAtualizadoContrato) > 0);
        ads.sort((a, b) => (a.dtAditivoContrato ?? "").localeCompare(b.dtAditivoContrato ?? ""));
        const valorInicial = Number(c.vlContrato);
        const valorAtual = ads.length ? Number(ads[ads.length - 1].vlAtualizadoContrato) : valorInicial;
        const liquidado = [...(ct.empenhos.get(c.idContrato) ?? [])].reduce((t, e) => t + (liq.get(e) ?? 0), 0);
        contrato = {
          id: c.idContrato,
          numero: c.nrContrato,
          ano: c.nrAnoContrato,
          contratado: c.nmContratado,
          doc: c.nrDocContratado,
          assinatura: data(c.dtAssinatura),
          valorInicial,
          valorAtual,
          aditivos: (ct.aditivos.get(c.idContrato) ?? []).length,
          liquidado,
          pago: valorAtual ? liquidado / valorAtual : 0,
        };
      }

      const bem = bemPor.get(r.idIntervencao);
      obras.push({
        id: r.idIntervencao,
        ano,
        entidade: NOMES_CURTOS[r.idPessoa] ?? capitalizar(r.nmEntidade),
        principal: r.idPessoa === "12294",
        nome: r.nmIntervencao.replace(/\s+/g, " ").trim(),
        valor,
        inicio,
        prazoDias,
        fimPrevisto,
        situacao,
        regime: r.dsTipoRegimeIntervencao,
        ultimaMedicao,
        referencia,
        desatualizada,
        prazoPassado,
        mesesSemMedicao,
        alerta,
        endereco: bem?.nmLogradouro?.replace(/\s*,\s*,\s*/g, ", ").trim() || null,
        bairro: bairroDe(bem?.nmLogradouro),
        coordenadas: coordenadas(bem?.dsCoordenadaGeografica),
        contrato,
        contratosAmbiguos: candidatos.length > 1 ? candidatos.length : 0,
        federal: null,
      });
    }
  }
  // Uma mesma obra pode aparecer em mais de um arquivo; fica a informação mais recente.
  const unicas = new Map<string, Obra>();
  for (const o of obras) {
    const atual = unicas.get(o.id);
    if (!atual || o.referencia >= atual.referencia) unicas.set(o.id, o);
  }
  const lista = [...unicas.values()];
  for (const o of lista) o.federal = federais(o);
  return lista;
}

let cache: Promise<Obra[]> | null = null;

/** Todas as obras (todas as entidades, todos os anos baixados). */
export function obras(): Promise<Obra[]> {
  if (!cache) {
    cache = montar();
    cache.catch(() => (cache = null));
  }
  return cache;
}

export const ATIVAS: Alerta[] = ["paralisada", "sem-medicao", "prazo-vencido", "em-dia", "nao-iniciada"];

export const ROTULO_ALERTA: Record<Alerta, string> = {
  paralisada: "Paralisada",
  "sem-medicao": `Sem medição há ${MESES_SEM_MEDICAO}+ meses`,
  "prazo-vencido": "Prazo vencido",
  "em-dia": "Dentro do prazo",
  "nao-iniciada": "Não iniciada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
