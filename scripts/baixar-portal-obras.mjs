#!/usr/bin/env node
// Baixa do Portal da Transparência da Prefeitura de Foz do Iguaçu (sistema Oxy) as
// obras públicas e, das obras recentes, as planilhas orçamentárias publicadas.
//
//   node scripts/baixar-portal-obras.mjs
//
// Grava em dados/portal-foz/:
//   obras.json          lista de obras como a API devolve (percentual executado,
//                       valor pago, situação, motivo de paralisação...)
//   planilhas.json      metadados das planilhas de cada obra recente
//   orcamentos/<id>.json  linhas do orçamento-base extraídas da planilha (fonte do
//                       preço, código, descrição, unidade, quantidade, custo e preço)
//
// Os arquivos originais (xlsx/rar/zip) ficam em dados/.cache/ (fora do git); o JSON
// guarda o nome e o sha256 de cada um para conferência. Planilhas .xls (formato
// antigo) e PDF ainda não são lidas e ficam registradas como "nao-lida".
// API: https://transparencia.foz.pr.gov.br/portaltransparencia-api (a mesma usada
// pelo portal público; exige o cabeçalho "entidade": 1 = Prefeitura).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const API = "https://transparencia.foz.pr.gov.br/portaltransparencia-api/api";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "dados");
const PASTA = join(RAIZ, "portal-foz");
const CACHE = join(RAIZ, ".cache", "portal-foz");
const ENTIDADE = "1";
const HEADERS = { "User-Agent": "fozcaliza (dados publicos de Foz do Iguacu)", entidade: ENTIDADE };
const INTERVALO_MS = 700;
/** Obras com planilha baixada: deste ano em diante, ou ainda não concluídas. */
const DESDE = 2022;

let ultima = 0;
async function pedir(caminho) {
  for (let tentativa = 1; ; tentativa++) {
    const espera = ultima + INTERVALO_MS - Date.now();
    if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
    ultima = Date.now();
    try {
      const r = await fetch(`${API}${caminho}`, { headers: HEADERS });
      if (r.ok) return r;
      if (![429, 500, 502, 503, 504].includes(r.status) || tentativa === 5) throw new Error(`${caminho}: HTTP ${r.status}`);
    } catch (erro) {
      if (tentativa === 5) throw erro;
    }
    await new Promise((ok) => setTimeout(ok, 2 ** tentativa * 1000));
  }
}
const json = async (caminho) => (await pedir(caminho)).json();
const grava = (arq, v) => writeFile(arq, JSON.stringify(v, null, 1) + "\n");

// ——— zip/xlsx sem dependências ———
function entradasZip(buf) {
  const saida = new Map();
  let fim = buf.length - 22;
  while (fim >= 0 && buf.readUInt32LE(fim) !== 0x06054b50) fim--;
  if (fim < 0) throw new Error("zip inválido");
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  for (let i = 0; i < total; i++) {
    const metodo = buf.readUInt16LE(p + 10);
    const tamanho = buf.readUInt32LE(p + 20);
    const lenNome = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + lenNome);
    p += 46 + lenNome + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const dados = buf.subarray(inicio, inicio + tamanho);
    if (metodo === 0 || metodo === 8) saida.set(nome, () => (metodo === 0 ? dados : inflateRawSync(dados)));
  }
  return saida;
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const xmlTexto = (s) =>
  s.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m)));
const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Abas de um xlsx/xlsm como { nome, linhas: [{ coluna: valor }] }. */
function lerXlsx(buf) {
  const z = entradasZip(buf);
  const ler = (n) => z.get(n)?.().toString() ?? "";
  const ss = [...ler("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    xmlTexto([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
  );
  const wb = ler("xl/workbook.xml");
  const rels = ler("xl/_rels/workbook.xml.rels");
  return [...wb.matchAll(/<sheet [^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g)].map(([, nome, rid]) => {
    const alvo =
      new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1] ?? "";
    const xml = ler(`xl/${alvo.replace(/^\/?xl\//, "")}`);
    const linhas = [...xml.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)].map((r) => {
      const o = {};
      for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const corpo = c[3] ?? "";
        const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(corpo)?.[1] ?? "";
        const valor = /t="s"/.test(c[2]) ? ss[+v] : xmlTexto(v);
        if (valor !== "" && valor !== undefined) o[c[1]] = valor;
      }
      return o;
    });
    return { nome: xmlTexto(nome), linhas };
  });
}

// ——— leitura do orçamento ———
// Cabeçalho: a primeira linha com "código" e "descrição" e alguma coluna de quantidade.
const COLUNAS = {
  fonte: (t) => /^(fonte|banco|base|referencia|ref\.?|origem)$/.test(t) || t.startsWith("fonte"),
  codigo: (t) => t.startsWith("codigo") || t === "cod." || t === "cod",
  descricao: (t) => t.startsWith("descricao") || t.startsWith("discriminacao") || t.startsWith("especificacao"),
  unidade: (t) => t.startsWith("unid") || t === "un" || t === "un." || t === "und",
  quantidade: (t) => t.startsWith("quant") || t === "qtd" || t === "qtde" || t === "qtd.",
  custo: (t) => /^(custo|valor|preco) unit[a-z.]*( (de )?referencia| sem bdi| s\/ ?bdi)?( \(r\$\))?$/.test(t) || t.startsWith("custo unitario"),
  precoBdi: (t) => /unit.*(com|c\/) ?bdi/.test(t) || t.startsWith("preco unitario edital"),
};

function lerOrcamento(abas) {
  let melhor = null;
  for (const aba of abas) {
    for (let i = 0; i < Math.min(aba.linhas.length, 60); i++) {
      const cab = aba.linhas[i];
      const col = {};
      for (const [c, v] of Object.entries(cab)) {
        const t = semAcento(String(v).replace(/\s+/g, " "));
        for (const [k, teste] of Object.entries(COLUNAS)) if (!col[k] && teste(t)) col[k] = c;
      }
      if (!(col.codigo && col.descricao && col.quantidade && (col.custo || col.precoBdi))) continue;
      const itens = [];
      for (const l of aba.linhas.slice(i + 1)) {
        const q = Number(l[col.quantidade]);
        const cu = Number(l[col.custo ?? col.precoBdi]);
        const cod = String(l[col.codigo] ?? "").trim();
        if (!cod || !(q > 0) || !(cu > 0)) continue;
        itens.push({
          fonte: col.fonte ? String(l[col.fonte] ?? "").trim() : "",
          codigo: cod,
          descricao: String(l[col.descricao] ?? "").trim(),
          unidade: String(l[col.unidade] ?? "").trim(),
          quantidade: q,
          custo: col.custo ? Number(l[col.custo]) : null,
          precoComBdi: col.precoBdi ? Number(l[col.precoBdi]) || null : null,
        });
      }
      if (itens.length && (!melhor || itens.length > melhor.itens.length)) melhor = { aba: aba.nome, colunas: col, itens, cabecalho: i };
      break;
    }
  }
  if (!melhor) return null;
  // Mês-base do SINAPI, quando a planilha informa (ex.: "02-25 (N DES.)" ou "02/2025").
  let dataBase = null;
  let localidade = null;
  for (const aba of abas) {
    for (let i = 0; i < Math.min(aba.linhas.length, 40) && !dataBase; i++) {
      for (const [c, v] of Object.entries(aba.linhas[i])) {
        const t = semAcento(v);
        if (t === "data base" || t.startsWith("data base") || t.startsWith("data-base")) {
          const abaixo = String(aba.linhas[i + 1]?.[c] ?? "");
          const m = /(\d{2})\s*[-/]\s*(\d{2,4})/.exec(abaixo) ?? /(\d{2})\s*[-/]\s*(\d{2,4})/.exec(String(v));
          if (m) dataBase = `${m[2].length === 2 ? "20" + m[2] : m[2]}-${m[1]}`;
        }
        if (t === "localidade sinapi") localidade = String(aba.linhas[i + 1]?.[c] ?? "") || null;
      }
    }
  }
  return { ...melhor, dataBase, localidade };
}

/** Extrai rar/zip com o que houver no sistema (bsdtar, tar.exe do Windows ou 7z). */
function extrair(arquivo, destino) {
  const tentativas = [
    ["bsdtar", ["-xf", arquivo, "-C", destino]],
    ["C:\\Windows\\System32\\tar.exe", ["-xf", arquivo, "-C", destino]],
    ["7z", ["x", "-y", `-o${destino}`, arquivo]],
  ];
  for (const [cmd, args] of tentativas) {
    try {
      execFileSync(cmd, args, { stdio: "ignore" });
      return true;
    } catch {
      /* próximo */
    }
  }
  return false;
}

async function arquivosEm(pasta) {
  const r = [];
  for (const n of await readdir(pasta, { withFileTypes: true })) {
    const p = join(pasta, n.name);
    if (n.isDirectory()) r.push(...(await arquivosEm(p)));
    else r.push(p);
  }
  return r;
}

/** Lê o orçamento de um arquivo baixado (xlsx direto, ou o maior orçamento dentro de rar/zip). */
async function orcamentoDoArquivo(caminho, nome) {
  const ext = extname(nome).toLowerCase();
  if (ext === ".xlsx" || ext === ".xlsm") return { ...(lerOrcamento(lerXlsx(await readFile(caminho))) ?? {}), arquivoInterno: null };
  if (ext !== ".rar" && ext !== ".zip") return null;
  const destino = `${caminho}.dir`;
  await rm(destino, { recursive: true, force: true });
  await mkdir(destino, { recursive: true });
  if (!extrair(caminho, destino)) return { erro: "não foi possível extrair o arquivo compactado" };
  let melhor = null;
  for (const f of await arquivosEm(destino)) {
    if (!/\.(xlsx|xlsm)$/i.test(f)) continue;
    try {
      const o = lerOrcamento(lerXlsx(await readFile(f)));
      if (o && (!melhor || o.itens.length > melhor.itens.length)) melhor = { ...o, arquivoInterno: f.slice(destino.length + 1).replaceAll("\\", "/") };
    } catch {
      /* planilha que não abre: ignora */
    }
  }
  return melhor;
}

// ——— execução ———
await mkdir(join(PASTA, "orcamentos"), { recursive: true });
await mkdir(CACHE, { recursive: true });

const lista = await json("/obras?page=0&size=10000");
const obras = lista.content ?? [];
await grava(join(PASTA, "obras.json"), obras);
console.log(`${obras.length} obras no portal.`);

const recentes = obras.filter((o) => o.exercicio >= DESDE || !["Concluída", "Cancelada"].includes(o.situacao));
const planilhas = [];
let lidos = 0;
let naoLidos = 0;
for (const [i, o] of recentes.entries()) {
  const ps = await json(`/obras/planilhas?idOxy=${o.idOxy}`);
  planilhas.push(...ps);
  const base = ps.filter((p) => /^or[cç]amento base/i.test(p.tipoPlanilha ?? ""));
  for (const p of base) {
    for (const a of p.arquivos ?? []) {
      const destinoJson = join(PASTA, "orcamentos", `${o.idOxy}_${p.sequencia}.json`);
      const cache = join(CACHE, `${a.idArquivo}${extname(a.nomeArquivo).toLowerCase()}`);
      if (!existsSync(cache)) await writeFile(cache, Buffer.from(await (await pedir(`/files/arquivo/${a.idArquivo}`)).arrayBuffer()));
      const buf = await readFile(cache);
      let orc = null;
      try {
        orc = await orcamentoDoArquivo(cache, a.nomeArquivo);
      } catch (e) {
        orc = { erro: String(e.message ?? e) };
      }
      const ok = !!orc?.itens?.length;
      ok ? lidos++ : naoLidos++;
      await grava(destinoJson, {
        idOxy: o.idOxy,
        obra: { exercicio: o.exercicio, ordemServico: o.ordemServico, descricao: o.descricao?.trim(), valorContrato: o.valorContrato },
        planilha: { sequencia: p.sequencia, tipo: p.tipoPlanilha, valorTotal: p.valorTotal, dataBase: p.dataBase, responsavel: p.responsavel },
        arquivo: { nome: a.nomeArquivo, idArquivo: a.idArquivo, sha256: createHash("sha256").update(buf).digest("hex"), bytes: (await stat(cache)).size, interno: orc?.arquivoInterno ?? null },
        leitura: ok ? "lida" : "nao-lida",
        motivo: ok ? null : (orc?.erro ?? (/\.(xls|pdf)$/i.test(a.nomeArquivo) ? `formato ${extname(a.nomeArquivo)} ainda não lido` : "orçamento não reconhecido na planilha")),
        sinapi: ok ? { dataBase: orc.dataBase, localidade: orc.localidade } : null,
        aba: orc?.aba ?? null,
        itens: ok ? orc.itens : [],
      });
    }
  }
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${recentes.length} obras; orçamentos lidos ${lidos}, não lidos ${naoLidos}`);
}
await grava(join(PASTA, "planilhas.json"), planilhas);
await grava(join(PASTA, "fonte.json"), {
  fonte: "Portal da Transparência da Prefeitura de Foz do Iguaçu",
  pagina: "https://transparencia.foz.pr.gov.br/portaltransparencia/1/obras",
  api: API,
  entidade: Number(ENTIDADE),
  baixado_em: new Date().toISOString(),
  obras: obras.length,
  obras_com_planilha_consultada: recentes.length,
  orcamentos_lidos: lidos,
  orcamentos_nao_lidos: naoLidos,
});
console.log(`Orçamentos lidos: ${lidos}; não lidos: ${naoLidos}. Gravado em ${PASTA}`);
