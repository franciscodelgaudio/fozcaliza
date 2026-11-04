#!/usr/bin/env node
// Consulta na base pública da Receita Federal (via minhareceita.org, com
// BrasilAPI como reserva) os CNPJs que aparecem nos XML do TCE-PR em
// dados/tce/<ano>/ e grava o essencial em dados/cnpj/cnpj.json.
//
//   node scripts/consultar-cnpj.mjs              # só CNPJs ainda não consultados
//   node scripts/consultar-cnpj.mjs --dias 30    # também reconsulta os consultados há mais de 30 dias
//
// Guarda só o que o site usa: razão social, município/UF (código IBGE), data de
// abertura, CNAE principal e situação cadastral. Sócios, telefones e e-mails
// não são gravados.

import { readFile, readdir, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "dados");
const SAIDA = join(RAIZ, "cnpj", "cnpj.json");
const HEADERS = { "User-Agent": "fozcaliza (dados publicos de Foz do Iguacu)", Accept: "application/json" };
const APIS = [
  { nome: "minhareceita.org", url: (c) => `https://minhareceita.org/${c}` },
  { nome: "brasilapi.com.br", url: (c) => `https://brasilapi.com.br/api/cnpj/v1/${c}` },
];
const INTERVALO_MS = 700; // ~1,4 consulta por segundo
const SALVAR_A_CADA = 50;

// Arquivo → atributo com o documento do fornecedor/participante.
const ORIGENS = [
  ["LicitacaoParticipante", "nrDocParticipanteLicitacao"],
  ["LicitacaoVencedor", "nrDocumento"],
  ["Contrato", "nrDocContratado"],
];

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** CNPJ válido pelos dígitos verificadores. */
export function cnpjValido(c) {
  if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const dv = (base) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = [...base].reduce((t, d, i) => t + Number(d) * pesos[i], 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}

async function cnpjsDosXml() {
  const encontrados = new Set();
  const anos = (await readdir(join(RAIZ, "tce"))).filter((n) => /^\d{4}$/.test(n));
  for (const ano of anos) {
    for (const [arquivo, campo] of ORIGENS) {
      let xml;
      try {
        xml = await readFile(join(RAIZ, "tce", ano, `${ano}_410830_${arquivo}.xml`), "utf8");
      } catch {
        continue;
      }
      for (const m of xml.matchAll(new RegExp(`${campo}="([^"]*)"`, "g"))) {
        const c = m[1].replace(/\D/g, "");
        if (c.length === 14) encontrados.add(c);
      }
    }
  }
  return [...encontrados].sort();
}

function resumir(d, api) {
  return {
    razao_social: d.razao_social ?? null,
    municipio: d.municipio ?? null,
    uf: d.uf ?? null,
    codigo_municipio_ibge: d.codigo_municipio_ibge ?? null,
    data_abertura: d.data_inicio_atividade ?? null,
    cnae_principal: d.cnae_fiscal ?? null,
    cnae_descricao: d.cnae_fiscal_descricao ?? null,
    situacao: d.descricao_situacao_cadastral ?? null,
    fonte: api,
  };
}

async function consultar(cnpj) {
  let ultimoErro;
  for (const api of APIS) {
    for (let tentativa = 1; tentativa <= 4; tentativa++) {
      try {
        const r = await fetch(api.url(cnpj), { headers: HEADERS, signal: AbortSignal.timeout(20000) });
        if (r.ok) return resumir(await r.json(), api.nome);
        if (r.status === 404) return { nao_encontrado: true, fonte: api.nome };
        if (![429, 500, 502, 503, 504].includes(r.status)) {
          ultimoErro = new Error(`${api.nome}: HTTP ${r.status}`);
          break;
        }
        ultimoErro = new Error(`${api.nome}: HTTP ${r.status}`);
      } catch (erro) {
        ultimoErro = erro;
      }
      await espera(2 ** tentativa * 1000);
    }
  }
  throw ultimoErro;
}

async function salvar(base) {
  const ordenado = Object.fromEntries(Object.keys(base.cnpjs).sort().map((k) => [k, base.cnpjs[k]]));
  const tmp = `${SAIDA}.tmp`;
  await writeFile(tmp, JSON.stringify({ ...base, cnpjs: ordenado }, null, 1) + "\n");
  await rename(tmp, SAIDA);
}

// A Receita publica o município sem acentos ("SAO MIGUEL DO IGUACU"). O nome
// oficial vem da API de localidades do IBGE, pelo código do município.
const MUNICIPIOS = join(RAIZ, "ibge", "municipios.json");
const URL_MUNICIPIOS = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado";

async function garantirMunicipios() {
  try {
    await readFile(MUNICIPIOS);
    return;
  } catch {}
  const r = await fetch(URL_MUNICIPIOS, { headers: HEADERS, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`IBGE: HTTP ${r.status}`);
  const lista = await r.json();
  const municipios = Object.fromEntries(
    lista
      .map((m) => [m["municipio-id"], { nome: m["municipio-nome"], uf: m["UF-sigla"] }])
      .sort((a, b) => a[0] - b[0]),
  );
  await mkdir(dirname(MUNICIPIOS), { recursive: true });
  await writeFile(
    MUNICIPIOS,
    JSON.stringify({ fonte: "IBGE — API de localidades", url: URL_MUNICIPIOS, baixado_em: new Date().toISOString().slice(0, 10), municipios }, null, 1) + "\n",
  );
  console.log(`IBGE: ${lista.length} municípios gravados.`);
}

async function main() {
  const i = process.argv.indexOf("--dias");
  const dias = i > 0 ? Number(process.argv[i + 1]) : null;
  await mkdir(dirname(SAIDA), { recursive: true });
  await garantirMunicipios();

  let base;
  try {
    base = JSON.parse(await readFile(SAIDA, "utf8"));
  } catch {
    base = {
      fonte: "Receita Federal — CNPJ (dados abertos), consultado via minhareceita.org / BrasilAPI",
      cnpjs: {},
    };
  }

  const todos = await cnpjsDosXml();
  const limite = dias == null ? null : Date.now() - dias * 864e5;
  const pendentes = todos.filter((c) => {
    if (!cnpjValido(c)) return false;
    const r = base.cnpjs[c];
    return !r || r.erro || (limite != null && Date.parse(r.consultado_em) < limite);
  });
  const invalidos = todos.filter((c) => !cnpjValido(c));
  for (const c of invalidos) base.cnpjs[c] = { invalido: true };
  console.log(`${todos.length} CNPJs nos XML, ${invalidos.length} inválidos, ${pendentes.length} para consultar.`);

  let feitos = 0;
  let falhas = 0;
  for (const c of pendentes) {
    try {
      base.cnpjs[c] = { ...(await consultar(c)), consultado_em: new Date().toISOString().slice(0, 10) };
    } catch (erro) {
      falhas++;
      base.cnpjs[c] = { ...(base.cnpjs[c] ?? {}), erro: String(erro.message ?? erro) };
      console.error(`${c}: ${erro.message ?? erro}`);
    }
    if (++feitos % SALVAR_A_CADA === 0) {
      await salvar(base);
      console.log(`${feitos}/${pendentes.length}`);
    }
    await espera(INTERVALO_MS);
  }
  base.atualizado_em = new Date().toISOString().slice(0, 10);
  await salvar(base);
  console.log(`Pronto: ${feitos} consultados, ${falhas} falhas.`);
  if (falhas > pendentes.length * 0.2) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("consultar-cnpj.mjs")) await main();
