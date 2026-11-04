#!/usr/bin/env node
// Baixa do PNCP (Portal Nacional de Contratações Públicas) as contratações publicadas
// por órgãos de Foz do Iguaçu e a lista de documentos (edital, atas, contratos) de
// cada uma, e grava as respostas, como vieram, em dados/pncp/<ano>/.
//
//   node scripts/baixar-pncp.mjs          # ano corrente
//   node scripts/baixar-pncp.mjs 2026
//
// O ano é o das licitações do TCE-PR que serão casadas; como o edital pode sair no
// PNCP antes da virada do ano, a busca começa em 1º de julho do ano anterior.
// API: https://pncp.gov.br/api/consulta/swagger-ui/index.html (sem autenticação).
// A consulta exige a modalidade e aceita no máximo 365 dias por vez.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONSULTA = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";
const PNCP = "https://pncp.gov.br/api/pncp/v1";
const IBGE = "4108304"; // Foz do Iguaçu
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "dados", "pncp");
const HEADERS = { "User-Agent": "fozcaliza (dados publicos de Foz do Iguacu)", Accept: "application/json" };
// O PNCP devolve 429 com facilidade: uma requisição por segundo e, no 429, espera o
// Retry-After (ou até um minuto) antes de tentar de novo.
const INTERVALO_MS = 1000;
const TENTATIVAS = 8;
const TAMANHO = 50;
// Códigos de modalidade do PNCP (Lei 14.133): leilão, diálogo competitivo, concurso,
// concorrência, pregão, dispensa, inexigibilidade, manifestação de interesse,
// pré-qualificação, credenciamento.
const MODALIDADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

let ultima = 0;
async function obter(url) {
  for (let tentativa = 1; ; tentativa++) {
    const espera = ultima + INTERVALO_MS - Date.now();
    if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
    ultima = Date.now();
    let esperar = Math.min(60, 2 ** tentativa) * 1000;
    try {
      const r = await fetch(url, { headers: HEADERS });
      if (r.status === 204 || r.status === 404) return null;
      if (r.ok) return await r.json();
      if (![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`${url}: HTTP ${r.status} ${await r.text()}`);
      const retry = Number(r.headers.get("retry-after"));
      if (retry > 0) esperar = Math.max(esperar, retry * 1000);
      if (tentativa === TENTATIVAS) throw new Error(`${url}: HTTP ${r.status} após ${tentativa} tentativas`);
      console.log(`  HTTP ${r.status}, esperando ${Math.round(esperar / 1000)} s`);
    } catch (erro) {
      if (tentativa === TENTATIVAS) throw erro;
    }
    await new Promise((ok) => setTimeout(ok, esperar));
  }
}

const aaaammdd = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");

/** Janelas de até 365 dias entre duas datas. */
function janelas(inicio, fim) {
  const r = [];
  for (let a = new Date(inicio); a <= fim; ) {
    const b = new Date(Math.min(fim.getTime(), a.getTime() + 364 * 86_400_000));
    r.push([aaaammdd(a), aaaammdd(b)]);
    a = new Date(b.getTime() + 86_400_000);
  }
  return r;
}

async function baixarAno(ano) {
  const hoje = new Date();
  const fim = new Date(Math.min(hoje.getTime(), Date.UTC(ano, 11, 31)));
  const inicio = new Date(Date.UTC(ano - 1, 6, 1));
  const contratacoes = new Map();
  for (const [de, ate] of janelas(inicio, fim)) {
    for (const modalidade of MODALIDADES) {
      for (let pagina = 1; ; pagina++) {
        const q = new URLSearchParams({
          dataInicial: de,
          dataFinal: ate,
          codigoModalidadeContratacao: String(modalidade),
          codigoMunicipioIbge: IBGE,
          pagina: String(pagina),
          tamanhoPagina: String(TAMANHO),
        });
        const r = await obter(`${CONSULTA}?${q}`);
        for (const c of r?.data ?? []) contratacoes.set(c.numeroControlePNCP, c);
        if (!r || !r.paginasRestantes) break;
      }
      console.log(`  ${de}–${ate} modalidade ${modalidade}: ${contratacoes.size} até agora`);
    }
  }
  const lista = [...contratacoes.values()].sort((a, b) => a.numeroControlePNCP.localeCompare(b.numeroControlePNCP));
  console.log(`${ano}: ${lista.length} contratações publicadas por órgãos de Foz do Iguaçu.`);

  const arquivos = [];
  for (const [i, c] of lista.entries()) {
    const { cnpj } = c.orgaoEntidade;
    const docs = (await obter(`${PNCP}/orgaos/${cnpj}/compras/${c.anoCompra}/${c.sequencialCompra}/arquivos`)) ?? [];
    arquivos.push({ numeroControlePNCP: c.numeroControlePNCP, arquivos: docs });
    if ((i + 1) % 100 === 0) console.log(`  documentos: ${i + 1}/${lista.length}`);
  }

  const pasta = join(RAIZ, String(ano));
  await mkdir(pasta, { recursive: true });
  const json = (v) => JSON.stringify(v, null, 2) + "\n";
  await writeFile(join(pasta, "contratacoes.json"), json(lista));
  await writeFile(join(pasta, "arquivos.json"), json(arquivos));
  await writeFile(
    join(pasta, "fonte.json"),
    json({
      fonte: "PNCP — Portal Nacional de Contratações Públicas",
      pagina: "https://pncp.gov.br/api/consulta/swagger-ui/index.html",
      codigoMunicipioIbge: IBGE,
      periodo: { de: aaaammdd(inicio), ate: aaaammdd(fim) },
      baixado_em: new Date().toISOString(),
      contratacoes: lista.length,
    }),
  );
}

const anos = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a)).map(Number);
for (const ano of anos.length ? anos : [new Date().getFullYear()]) await baixarAno(ano);
