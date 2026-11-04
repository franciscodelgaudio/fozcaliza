#!/usr/bin/env node
// Baixa do Obrasgov.br (API de dados abertos do governo federal) os projetos de
// investimento com geometria em Foz do Iguaçu e grava as respostas, como vieram,
// em dados/obrasgov/. O Obrasgov cobre obras com recurso federal (transferências,
// convênios, obras de órgãos federais); traz percentual de execução física e o
// histórico de paralisações, que o TCE-PR não publica.
//
//   node scripts/baixar-obrasgov.mjs
//
// API: https://api-publica.obrasgov.gestao.gov.br/obras/docs (sem autenticação,
// limite de 60 requisições por minuto).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://api-publica.obrasgov.gestao.gov.br/obras";
const IBGE = 4108304; // Foz do Iguaçu
const PASTA = join(dirname(fileURLToPath(import.meta.url)), "..", "dados", "obrasgov");
const HEADERS = { "User-Agent": "fozcaliza (dados publicos de Foz do Iguacu)", Accept: "application/json" };
const INTERVALO_MS = 1100; // < 60 por minuto
const TAMANHO = 200;

// Recursos lidos por projeto (nome do arquivo → endpoint).
const RECURSOS = {
  projetos: "projeto-investimento",
  "execucao-fisica": "execucao-fisica",
  "historico-paralisacao": "historico-situacao-cancelada-paralisada",
  contratos: "contrato",
};

let ultima = 0;
async function obter(caminho, params) {
  const url = `${BASE}/${caminho}?${new URLSearchParams(params)}`;
  for (let tentativa = 1; ; tentativa++) {
    const espera = ultima + INTERVALO_MS - Date.now();
    if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
    ultima = Date.now();
    try {
      const r = await fetch(url, { headers: HEADERS });
      if (r.ok) return await r.json();
      if (![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`${url}: HTTP ${r.status}`);
      if (tentativa === 5) throw new Error(`${url}: HTTP ${r.status} após ${tentativa} tentativas`);
    } catch (erro) {
      if (tentativa === 5) throw erro;
    }
    await new Promise((ok) => setTimeout(ok, 2 ** tentativa * 1000));
  }
}

/** Todas as páginas de um recurso. */
async function todas(caminho, filtros) {
  const dados = [];
  for (let pagina = 1; ; pagina++) {
    const r = await obter(caminho, { ...filtros, pagina, tamanho_da_pagina: TAMANHO });
    dados.push(...(r.data ?? []));
    if (pagina >= (r.total_pages ?? 1) || !(r.data ?? []).length) return dados;
  }
}

const json = (v) => JSON.stringify(v, null, 2) + "\n";
const porId = (a, b) => String(a.id_projeto_investimento).localeCompare(String(b.id_projeto_investimento));

const { data_ultima_atualizacao } = await obter("data-atualizacao", {});
const anterior = JSON.parse(await readFile(join(PASTA, "fonte.json"), "utf8").catch(() => "{}"));
if (anterior.data_ultima_atualizacao === data_ultima_atualizacao && !process.argv.includes("--forcar")) {
  console.log(`Obrasgov sem mudança (${data_ultima_atualizacao}).`);
  process.exit(0);
}

await mkdir(PASTA, { recursive: true });
const geometria = (await todas("geometria", { cod_ibge: IBGE })).sort(
  (a, b) => porId(a, b) || String(a.id_geometria).localeCompare(String(b.id_geometria)),
);
const ids = [...new Set(geometria.map((g) => g.id_projeto_investimento))].sort();
console.log(`${ids.length} projetos com geometria em Foz do Iguaçu.`);

const saida = Object.fromEntries(Object.keys(RECURSOS).map((k) => [k, []]));
for (const [i, id] of ids.entries()) {
  for (const [nome, caminho] of Object.entries(RECURSOS)) saida[nome].push(...(await todas(caminho, { id_projeto_investimento: id })));
  if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${ids.length}`);
}

await writeFile(join(PASTA, "geometria.json"), json(geometria));
for (const [nome, linhas] of Object.entries(saida)) await writeFile(join(PASTA, `${nome}.json`), json(linhas.sort(porId)));
await writeFile(
  join(PASTA, "fonte.json"),
  json({
    fonte: "Obrasgov.br — API de dados abertos (Ministério da Gestão e da Inovação)",
    pagina: `${BASE}/docs`,
    cod_ibge: IBGE,
    data_ultima_atualizacao,
    baixado_em: new Date().toISOString(),
    projetos: ids.length,
  }),
);
console.log(`Gravado em ${PASTA} (base de ${data_ultima_atualizacao}).`);
