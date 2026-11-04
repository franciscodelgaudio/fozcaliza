#!/usr/bin/env node
// Baixa os arquivos "Download de Dados" do Portal Informação para Todos (TCE-PR)
// de Foz do Iguaçu e grava os XML, exatamente como publicados, em dados/tce/<ano>/.
//
//   node scripts/baixar-tce.mjs            # ano corrente
//   node scripts/baixar-tce.mjs 2025 2026  # anos escolhidos
//   node scripts/baixar-tce.mjs --forcar   # baixa mesmo sem mudança no Last-Modified
//   node scripts/baixar-tce.mjs --existentes 2026  # 2026 + todo ano já presente em dados/tce
//   node scripts/baixar-tce.mjs --obras 2013-2025 --financeiro 2022-2025
//
// Recorte de obras (--obras / --financeiro) vai para dados/tce-obras/<ano>, separado
// dos anos completos: só o cadastro de obras (Intervencao) e, nos anos de
// --financeiro, os XML que ligam obra → contrato → liquidação (para o "% pago").
// Os anos de obras já presentes são verificados de novo com --existentes.
//
// O TCE regenera os zips uma vez por semana (domingo), só com remessas mensais
// do SIM-AM já fechadas. Um tema só é baixado se o Last-Modified mudou desde a
// última vez (registrado em dados/tce/<ano>/fonte.json). O histórico de versões
// fica no git: cada mudança publicada pelo TCE vira um commit.

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const DADOS = join(dirname(fileURLToPath(import.meta.url)), "..", "dados");
const RAIZ = join(DADOS, "tce");
const RAIZ_OBRAS = join(DADOS, "tce-obras");
const IBGE6 = "410830"; // Foz do Iguaçu
const TEMAS = ["Licitacao", "Contrato", "Convenio", "Obra", "Despesa", "Combustivel", "Diarias", "Relacionamentos"];
// Recorte de obras: tema → XML mantidos (sem ano/município). null = todos.
const RECORTE_OBRAS = { Obra: null };
const RECORTE_FINANCEIRO = {
  ...RECORTE_OBRAS,
  Contrato: ["Contrato", "ContratoAditivo"],
  Relacionamentos: ["EmpenhoXContrato"],
  Despesa: ["EmpenhoLiquidacao"],
};
const URL = (ano, tema) => `https://pit.tce.pr.gov.br/Arquivos/${ano}/${ano}_${IBGE6}_${tema}.zip`;
const PAGINA = "https://pit.tce.pr.gov.br/Dados/DadosConsulta/Consolidado";
const HEADERS = { "User-Agent": "fozcaliza (dados publicos de Foz do Iguacu)" };

async function requisitar(url, metodo = "GET") {
  for (let tentativa = 1; ; tentativa++) {
    try {
      const r = await fetch(url, { method: metodo, headers: HEADERS });
      if (r.ok || r.status === 404) return r;
      if (![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`${url}: HTTP ${r.status}`);
      if (tentativa === 5) throw new Error(`${url}: HTTP ${r.status} após ${tentativa} tentativas`);
    } catch (erro) {
      if (tentativa === 5) throw erro;
    }
    await new Promise((ok) => setTimeout(ok, 2 ** tentativa * 1000));
  }
}

// Lê um zip pelo diretório central (sem dependências). Só aceita "stored" e "deflate".
function* entradasZip(buf) {
  let fim = buf.length - 22;
  while (fim >= 0 && buf.readUInt32LE(fim) !== 0x06054b50) fim--;
  if (fim < 0) throw new Error("zip inválido: diretório central não encontrado");
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip inválido: entrada do diretório central");
    const metodo = buf.readUInt16LE(p + 10);
    const tamanhoComprimido = buf.readUInt32LE(p + 20);
    const lenNome = buf.readUInt16LE(p + 28);
    const lenExtra = buf.readUInt16LE(p + 30);
    const lenComentario = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + lenNome);
    p += 46 + lenNome + lenExtra + lenComentario;

    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const dados = buf.subarray(inicio, inicio + tamanhoComprimido);
    if (metodo === 0) yield [nome, dados];
    else if (metodo === 8) yield [nome, inflateRawSync(dados)];
    else throw new Error(`zip: método de compressão ${metodo} não suportado (${nome})`);
  }
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function lerJson(caminho) {
  try {
    return JSON.parse(await readFile(caminho, "utf8"));
  } catch {
    return null;
  }
}

async function baixarAno(ano, forcar, raiz = RAIZ, recorte = null) {
  const pasta = join(raiz, String(ano));
  const caminhoFonte = join(pasta, "fonte.json");
  const fonte = (await lerJson(caminhoFonte)) ?? { fonte: "TCE-PR — Portal Informação para Todos", pagina: PAGINA, ano, temas: {} };
  if (recorte) fonte.recorte = recorte;
  await mkdir(pasta, { recursive: true });
  let mudou = false;
  const prefixo = `${ano}_${IBGE6}_`;

  for (const tema of recorte ? Object.keys(recorte) : TEMAS) {
    const url = URL(ano, tema);
    const anterior = fonte.temas[tema];
    const head = await requisitar(url, "HEAD");
    if (head.status === 404) {
      console.log(`${ano} ${tema}: não publicado`);
      continue;
    }
    const lastModified = head.headers.get("last-modified");
    if (!forcar && anterior && anterior.lastModified === lastModified) {
      console.log(`${ano} ${tema}: sem mudança (${lastModified})`);
      continue;
    }

    const zip = Buffer.from(await (await requisitar(url)).arrayBuffer());
    const arquivos = {};
    for (const [nome, conteudo] of entradasZip(zip)) {
      if (!nome.toLowerCase().endsWith(".xml") || nome.includes("/") || nome.includes("\\")) {
        throw new Error(`${url}: entrada inesperada no zip: ${nome}`);
      }
      const manter = recorte?.[tema];
      if (manter && !manter.includes(nome.replace(prefixo, "").replace(/\.xml$/i, ""))) continue;
      await writeFile(join(pasta, nome), conteudo);
      arquivos[nome] = { bytes: conteudo.length, sha256: sha256(conteudo) };
    }
    // XML que sumiu do zip sai da pasta também (o git guarda a versão anterior).
    for (const nome of Object.keys(anterior?.arquivos ?? {})) {
      if (!(nome in arquivos)) await rm(join(pasta, nome), { force: true });
    }

    const igual = anterior && JSON.stringify(anterior.arquivos) === JSON.stringify(arquivos);
    fonte.temas[tema] = { url, lastModified, arquivos };
    mudou = true;
    console.log(`${ano} ${tema}: ${igual ? "regerado, conteúdo igual" : "atualizado"} (${lastModified}, ${Object.keys(arquivos).length} XML)`);
  }

  if (mudou) await writeFile(caminhoFonte, JSON.stringify(fonte, null, 2) + "\n");
}

const args = process.argv.slice(2);
const forcar = args.includes("--forcar");

/** Anos depois de uma opção ("2013-2025" ou "2024 2025"), até a próxima opção. */
function anosDe(opcao) {
  const i = args.indexOf(opcao);
  if (i < 0) return [];
  const r = [];
  for (const a of args.slice(i + 1)) {
    if (a.startsWith("--")) break;
    const m = /^(\d{4})(?:-(\d{4}))?$/.exec(a);
    if (!m) throw new Error(`ano inválido: ${a}`);
    for (let n = Number(m[1]); n <= Number(m[2] ?? m[1]); n++) r.push(n);
  }
  return r;
}

const obras = new Map(anosDe("--obras").map((a) => [a, RECORTE_OBRAS]));
for (const a of anosDe("--financeiro")) obras.set(a, RECORTE_FINANCEIRO);
const opcoesComAno = new Set([...anosDe("--obras"), ...anosDe("--financeiro")]);
const anos = new Set(args.filter((a) => /^\d{4}$/.test(a) && !opcoesComAno.has(Number(a))).map(Number));
if (args.includes("--existentes")) {
  // Anos já baixados continuam sendo verificados: o TCE regera anos fechados
  // quando chegam remessas atrasadas ou retificações.
  try {
    for (const n of await readdir(RAIZ)) if (/^\d{4}$/.test(n)) anos.add(Number(n));
  } catch {}
  try {
    for (const n of await readdir(RAIZ_OBRAS)) {
      if (!/^\d{4}$/.test(n) || obras.has(Number(n))) continue;
      const f = await lerJson(join(RAIZ_OBRAS, n, "fonte.json"));
      if (f?.recorte) obras.set(Number(n), f.recorte);
    }
  } catch {}
}
if (anos.size === 0 && obras.size === 0) anos.add(new Date().getFullYear());

for (const ano of [...anos].sort()) await baixarAno(ano, forcar);
for (const [ano, recorte] of [...obras].sort((a, b) => a[0] - b[0])) await baixarAno(ano, forcar, RAIZ_OBRAS, recorte);
console.log(`Anos em ${RAIZ}: ${(await readdir(RAIZ)).join(", ")}`);
if (obras.size) console.log(`Anos de obras em ${RAIZ_OBRAS}: ${(await readdir(RAIZ_OBRAS)).join(", ")}`);
