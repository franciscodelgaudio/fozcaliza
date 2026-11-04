# Fozcaliza

Despesas, licitações, contratos, obras, combustíveis e diárias de Foz do Iguaçu,
lidos diretamente dos XML abertos do TCE-PR. Não tem banco de dados.

| Pasta        | O que é |
|--------------|---------|
| `dados/tce/` | XML do [Download de Dados do TCE-PR](https://pit.tce.pr.gov.br/Dados/DadosConsulta/Consolidado), byte a byte como publicados, um diretório por ano |
| `scripts/`   | `baixar-tce.mjs`: baixa os zips e extrai os XML (Node 24, sem dependências) |
| `frontend/`  | Next.js que lê os XML do disco e mostra cada tema como tabela |

## Dados

```bash
node scripts/baixar-tce.mjs              # ano corrente
node scripts/baixar-tce.mjs 2025 2026    # anos escolhidos
node scripts/baixar-tce.mjs --existentes # ano corrente + anos já baixados
```

- **Quando atualiza:** o TCE-PR gera os arquivos **uma vez por semana, aos
  domingos**. Eles só incluem remessas mensais do SIM-AM já fechadas, então os
  dados ficam de 2 a 3 meses atrás do calendário. A visão geral do site mostra
  até que mês cada entidade já entregou.
- **Incremental:** um tema só é baixado de novo se o `Last-Modified` do zip
  mudou. `dados/tce/<ano>/fonte.json` guarda a URL, o `Last-Modified` e o
  sha256 de cada XML.
- **Histórico:** fica no git. O workflow `.github/workflows/baixar-tce.yml`
  roda toda segunda às 9h (Brasília) e faz um commit só quando o TCE publicou
  algo diferente.
- **Tamanho:** o `Empenho.xml` de um ano inteiro tem ~85 MB. O GitHub avisa
  acima de 50 MB e recusa acima de 100 MB por arquivo.

## Site

```bash
cd frontend
npm install
npm run dev     # http://localhost:3000
```

Os XML são lidos de `../dados/tce` (dá para trocar com `TCE_DADOS`). O parse
roda uma vez por processo e o resultado fica em memória. O primeiro acesso a
Despesas leva ~2 s.

| Rota | O que mostra |
|------|--------------|
| `/` e `/<ano>` | Totais, temas, última remessa de cada entidade, lista de XML |
| `/<ano>/<tema>` | Tabela com busca, filtro por entidade, ordenação e paginação |
| `/<ano>/<tema>/<id>` | Registro com relacionados (pagamentos, aditivos, participantes…) e vínculos (empenho ↔ contrato ↔ licitação) |
| `/<ano>/credores` | Credores pelo valor pago nos empenhos do ano |
| `/<ano>/arquivos/<nome>` | Qualquer XML como tabela, com todas as colunas |

Problemas da fonte que o site mostra em vez de esconder:
- `EmpenhoPagamento.xml` publica os últimos atributos com nomes deslocados
  (`vlPagamentoBruto="BANCO"`). Só `dtOperacao` e `vlOperacao` são usados.
- O `vlPagamento` publicado em cada empenho nem sempre bate com a soma dos
  pagamentos datados. As duas colunas aparecem lado a lado.
