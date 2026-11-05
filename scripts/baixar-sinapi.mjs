#!/usr/bin/env node
// Baixa o SINAPI (Caixa/IBGE) do mês mais recente e grava os preços de referência do
// Paraná em dados/sinapi/<AAAA-MM>/: insumos (aba ISD) e composições (aba CSD), ambos
// sem desoneração. O SINAPI é a referência de preço obrigatória para obras e serviços
// de engenharia com recurso da União (Lei 14.133, art. 23, §2º) e a usual nas
// prefeituras.
//
//   node scripts/baixar-sinapi.mjs            # mês mais recente publicado
//   node scripts/baixar-sinapi.mjs 2026-09    # mês escolhido
//   node scripts/baixar-sinapi.mjs --forcar   # baixa de novo mesmo se o mês já existir
//
// O arquivo da Caixa é nacional (~16 MB, todos os estados); só a coluna do PR é
// gravada, com o sha256 do zip original em fonte.json para conferência. O site da
// Caixa exige um cookie de sessão: o script segue os redirecionamentos guardando-o.

import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "dados", "sinapi");
const URL_MES = (m) => `https://www.caixa.gov.br/Downloads/sinapi-relatorios-mensais/SINAPI-${m}-formato-xlsx.zip`;
const UF = "PR";
const HEADERS = { "User-Agent": "fozcaliza (dados publicos de Foz do Iguacu)" };

const cookies = new Map();
async function obter(url) {
  for (let i = 0; i < 8; i++) {
    const r = await fetch(url, {
      headers: { ...HEADERS, Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") },
      redirect: "manual",
    });
    for (const c of r.headers.getSetCookie()) {
      const [par] = c.split(";");
      const j = par.indexOf("=");
      cookies.set(par.slice(0, j).trim(), par.slice(j + 1).trim());
    }
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      url = new URL(r.headers.get("location"), url).toString();
      continue;
    }
    return r;
  }
  throw new Error(`${url}: redirecionamentos demais`);
}

// Zip pelo diretório central (mesmo leitor de scripts/baixar-tce.mjs).
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
    saida.set(nome, metodo === 0 ? dados : inflateRawSync(dados));
  }
  return saida;
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const xmlTexto = (s) => s.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m));

/** Lê uma aba do xlsx como lista de linhas { coluna: valor }. Códigos dentro de HYPERLINK(...) são extraídos. */
function lerAba(xlsx, nomeAba) {
  const wb = xlsx.get("xl/workbook.xml").toString();
  const rid = new RegExp(`<sheet [^>]*name="${nomeAba}"[^>]*r:id="([^"]+)"`).exec(wb)?.[1];
  const rels = xlsx.get("xl/_rels/workbook.xml.rels").toString();
  const alvo = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1];
  if (!alvo) throw new Error(`aba ${nomeAba} não encontrada`);
  const ss = [...(xlsx.get("xl/sharedStrings.xml")?.toString() ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    xmlTexto([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
  );
  const xml = xlsx.get(`xl/${alvo.replace(/^\/?xl\//, "")}`).toString();
  return [...xml.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)].map((r) => {
    const linha = {};
    for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const corpo = c[3] ?? "";
      const f = /<f>([\s\S]*?)<\/f>/.exec(corpo)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(corpo)?.[1] ?? "";
      const hiper = f && /HYPERLINK\([\s\S]*,\s*(\d+)\)\s*$/.exec(xmlTexto(f))?.[1];
      linha[c[1]] = hiper ?? (/t="s"/.test(c[2]) ? ss[+v] : xmlTexto(v));
    }
    return linha;
  });
}

/** Coluna do estado na linha de siglas (a primeira linha que tem "AC" e "PR"). */
function colunaUf(linhas) {
  for (const l of linhas) {
    const cols = Object.entries(l).filter(([, v]) => v === UF);
    if (cols.length && Object.values(l).includes("AC")) return cols[0][0];
  }
  throw new Error(`coluna ${UF} não encontrada`);
}

const numero = (v) => (v === undefined || v === "" ? null : Number(v));

function insumos(linhas) {
  const col = colunaUf(linhas);
  const inicio = linhas.findIndex((l) => /^Classifica/.test(l.A ?? ""));
  return linhas
    .slice(inicio + 1)
    .filter((l) => /^\d+$/.test(l.B ?? ""))
    .map((l) => ({ codigo: l.B, classificacao: l.A, descricao: l.C?.trim(), unidade: l.D, origem: l.E, preco: numero(l[col]) }));
}

function composicoes(linhas) {
  const col = colunaUf(linhas);
  const inicio = linhas.findIndex((l) => /^Grupo/.test(l.A ?? ""));
  return linhas
    .slice(inicio + 1)
    .filter((l) => /^\d+$/.test(l.B ?? ""))
    .map((l) => ({ codigo: l.B, grupo: l.A, descricao: l.C?.trim(), unidade: l.D, custo: numero(l[col]) }));
}

async function mesesCandidatos() {
  const arg = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a));
  if (arg) return [arg];
  const d = new Date();
  return Array.from({ length: 4 }, (_, i) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    return x.toISOString().slice(0, 7);
  });
}

await obter("https://www.caixa.gov.br/site/Paginas/downloads.aspx"); // cookie de sessão
const forcar = process.argv.includes("--forcar");
for (const mes of await mesesCandidatos()) {
  if (!forcar && (await access(join(RAIZ, mes, "fonte.json")).then(() => true, () => false))) {
    console.log(`${mes}: já baixado (use --forcar para baixar de novo)`);
    break;
  }
  const r = await obter(URL_MES(mes));
  if (r.status === 404) {
    console.log(`${mes}: ainda não publicado`);
    continue;
  }
  if (!r.ok) throw new Error(`${URL_MES(mes)}: HTTP ${r.status}`);
  const zip = Buffer.from(await r.arrayBuffer());
  const externo = entradasZip(zip);
  const nomeRef = [...externo.keys()].find((n) => /Refer.*\.xlsx$/i.test(n));
  if (!nomeRef) throw new Error("planilha de referência não encontrada no zip");
  const xlsx = entradasZip(externo.get(nomeRef));
  const ins = insumos(lerAba(xlsx, "ISD"));
  const comp = composicoes(lerAba(xlsx, "CSD"));

  const pasta = join(RAIZ, mes);
  await mkdir(pasta, { recursive: true });
  const json = (v) => JSON.stringify(v, null, 1) + "\n";
  await writeFile(join(pasta, "insumos-pr.json"), json(ins));
  await writeFile(join(pasta, "composicoes-pr.json"), json(comp));
  await writeFile(
    join(pasta, "fonte.json"),
    json({
      fonte: "SINAPI — Caixa Econômica Federal / IBGE",
      url: URL_MES(mes),
      mes,
      uf: UF,
      desoneracao: "sem desoneração",
      abas: { insumos: "ISD", composicoes: "CSD" },
      arquivo_original: { nome: nomeRef, zip_sha256: createHash("sha256").update(zip).digest("hex"), zip_bytes: zip.length },
      baixado_em: new Date().toISOString(),
      insumos: ins.length,
      composicoes: comp.length,
    }),
  );
  console.log(`${mes}: ${ins.length} insumos e ${comp.length} composições do ${UF} em ${pasta}`);
  break;
}
