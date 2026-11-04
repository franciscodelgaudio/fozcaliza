# Inspeção de dados — TCE-PR, Foz do Iguaçu, 2026

Fase 1 do plano de entrega (pendências 1 e 2). Base: `dados/tce/2026/`, publicação
do TCE-PR de 01/11/2026 (`DataReferencia=2026/11`; último envio SIM-AM `2026/08`).
Só 2026 está baixado; os números abaixo não cobrem o período do Observatório.

## Arquivos e volume

| Arquivo | Linhas | Para quê |
|---|---:|---|
| `Licitacao.xml` | 707 | cabeçalho da licitação |
| `LicitacaoParticipante.xml` | 1.201 | participantes (CNPJ/CPF, situação) |
| `LicitacaoVencedor.xml` | 3.403 | **itens** vencidos, com preço máximo e proposta |
| `LicitacaoXContrato.xml` | — | 364 licitações ligadas a contratos |
| `LicitacaoXEmpenho.xml` | 13.461 | **4.598 linhas sem `idLicitacao`** |
| `Contrato.xml` | 828 | 557 contratos + 271 atas de registro de preço |
| `ContratoAditivo*.xml` | 282 (valor) | aditivos de valor, prazo, rescisão… |
| `Intervencao.xml` | 13 | **obras** (só Município) |
| `IntervencaoBem.xml` | 13 | endereço e coordenada de cada obra |

Soma de `vlLicitacao` em 2026: R$ 484,8 mi. Soma de `vlContrato`: R$ 278,6 mi.

## Pendência 1a — Licitações trazem participantes?

**Sim, mas incompleto.** 618 de 707 licitações têm participante. A falta se concentra
justamente nas modalidades competitivas:

| Modalidade | Licitações | Sem participante | Com 1 | Com 2+ |
|---|---:|---:|---:|---:|
| Pregão eletrônico | 62 | **45** | 4 | 13 |
| Pregão | 58 | **29** | 17 | 12 |
| Concorrência eletrônica | 12 | **9** | 3 | 0 |
| Concorrência | 10 | 2 | 8 | 0 |
| Dispensa | 139 | 4 | 126 | 9 |
| Inexigibilidade | 426 | 0 | 417 | 9 |

Consequências:
- **Sinal 1 ("só uma empresa disputou")**: "sem participante" não pode virar "1".
  Precisa de um terceiro estado, "sem informação". Situação `Andamento` (424 de 707)
  explica parte da falta; o resto deve ser completado com o PNCP.
- Participante pode aparecer em várias linhas (Classificado, Habilitado…). Contar CNPJ distinto.
- 67 participantes são CPF (pessoa física): não mostrar nome nas fichas (seção 11).

## Pendência 1b — Obras trazem % executado, cronograma e medições?

**Não.** `Intervencao.xml` traz: nome, valor, `dtInicio`, `nrPrazoExecucao` (dias),
`dsSituacao` (Em andamento 10, Não iniciada 2, Paralisada 1), regime e
`dtUltimaMedicao` (só a **data**, sem valor nem %). Não há:
- percentual executado → a situação "atrasada/no ritmo" (9.2) **não sai do TCE-PR**;
- vínculo com contrato ou licitação (não existe `IntervencaoXContrato`);
- bairro como campo: vem dentro de `nmLogradouro` ("Av. Mario Filho 0, , Morumbi II");
- coordenadas em graus/min/seg em texto (`25°32'9.7 Sul, 54°32'2.1 Oeste`), precisa parse.

O arquivo de 2026 lista só obras **iniciadas em 2026** (13 obras, R$ 55,7 mi). As 65
obras do Observatório exigem baixar anos anteriores e/ou o KML do mapa.

## Pendência 2 — Quais dos 7 documentos vêm do TCE-PR?

| Documento | No TCE-PR? |
|---|---|
| Edital | Só metadados (`dtEdital`, número). Arquivo, não |
| Contrato | Metadados, se a obra for casada com um contrato (casamento manual/por nome) |
| Projeto básico | Não |
| Cronograma | Não (só prazo total em dias) |
| Medições | Não (só data da última) |
| Aditivos | Sim, metadados (`ContratoAditivo*`), se o contrato for casado |
| Fiscalização/fotos | Não |

Ou seja: a **presença publicada** dos 7 documentos tem que ser verificada no Portal da
Transparência da prefeitura (ou no PNCP para edital/contrato). O TCE-PR prova que o
ato existe, não que o documento está acessível ao cidadão.

## Outros problemas encontrados

1. **Não há "secretaria" na licitação.** Só `nmEntidade` (Município, Fundação de Saúde,
   Fundação Cultural, Câmara, FozPrev, FozHabita, FozTrans). A secretaria (`nmOrgao`/
   `nmUnidade`) existe no **empenho**; dá para herdar via `LicitacaoXEmpenho`, mas
   34% dessas linhas não têm `idLicitacao`.
   Isso afeta o item da lista (5.3) e o **sinal 6** (concentração "na mesma secretaria").
2. **Câmara e FozPrev estão no arquivo.** A seção fala da "prefeitura". Precisa decidir
   se entram (provavelmente filtrar ou separar por entidade).
3. **Valor do item ambíguo em `LicitacaoVencedor`.** `vlPropostaItem` e
   `vlLicitacaoVencedorLicitacao` às vezes são unitários, às vezes totais (pelo menos
   496 de 2.923 itens com quantidade > 1 parecem total). Somar `qtd × valor` dá
   R$ 94 bi, impossível. Precisa heurística (comparar com `vlMaximoUnitarioitem` e
   `vlMaximoTotal`) e marcar itens ambíguos.
4. **Sem código de catálogo (CATMAT/CATSER) nos itens.** `dsItem` é texto livre, às vezes
   com código interno ("Giig.105275"). O cruzamento de preço da seção 9.6 só é possível
   com os itens do **PNCP**, não do TCE-PR.
5. **Valor estimado**: `vlLicitacao` (cabeçalho) e `vlMaximoTotal` (por item) existem.
   O "contratado" pode vir de `Contrato.vlContrato` (via `LicitacaoXContrato`) ou da soma
   dos itens vencidos. Atas de registro de preço (271) não são gasto — não somar como contratado.
6. **`dsNaturezaLicitacao`** vem como lista concatenada de todas as opções (5 valores
   distintos no ano inteiro). Inútil como está.
7. **Município/UF do fornecedor não existe** em nenhum arquivo: só CNPJ. A origem
   (passos 2 e 3) depende 100% da base da Receita.
8. **Inexigibilidade é a modalidade dominante**: 426 de 707 licitações, R$ 124 mi. Sinal 2
   vai acender em mais da metade das compras — o texto do passo 6 precisa lidar com isso.
9. Datas para sinais 4 e 5 existem: `dtEdital`, `dtAbertura` (licitação) e
   `dtHomologacao` (por item, no vencedor).

## O que cada passo da história consegue hoje

| Passo | Viável com TCE-PR + Receita? |
|---|---|
| 1 Total | Sim |
| 2–3 Origem | Sim, depois do CNPJ da Receita |
| 4 Obras no ritmo | **Não** — falta % executado (Observatório ou portal) |
| 5 Documentos | **Não** — exige verificação no portal |
| 6 Sinais | Parcial — sinal 1 com lacunas, sinal 3 exige PNCP, sinal 6 depende de secretaria |
| 7 Preço | **Não** — exige itens do PNCP com catálogo |

---

# Fase 2 — modelo, CNPJ e origem do fornecedor

Decisões (04/11/2026): **sem banco** (o Next.js lê os XML e os JSON de `dados/`);
**só 2026** por enquanto; **padrão = prefeitura** (Município de Foz do Iguaçu, `idPessoa=12294`),
com as demais entidades como filtro (`entidade=saude|cultura|camara|fozprev|fozhabita|foztrans|todas`);
CNPJ por **API pública**.

## O que foi feito

- `scripts/consultar-cnpj.mjs`: consulta minhareceita.org (BrasilAPI como reserva), ~1/s,
  grava em `dados/cnpj/cnpj.json` só razão social, município/UF (código IBGE), data de
  abertura, CNAE e situação. Nomes de município com acento vêm de `dados/ibge/municipios.json`
  (API de localidades do IBGE). Roda no workflow semanal depois do TCE-PR (`--dias 30`).
  Primeira carga: **854 CNPJs, 0 falhas, 0 não encontrados**.
- `frontend/src/lib/licitacoes/`: `modelo.ts` (licitação com itens, vencedores, participantes,
  contratos, gestão), `fornecedores.ts` (origem), `agregados.ts` (por origem e por cidade),
  `gestao.ts` (tabela de mandatos).
- `GET /api/licitacoes/agregado?por=origem|cidade&entidade=…&ano=…`

## Regras de valor

- **Valor homologado** = soma dos itens vencidos (`LicitacaoVencedor`). É a base de
  "para onde foi o dinheiro". O valor estimado (`vlLicitacao`) aparece à parte.
- Valor do item: `quantidade × valor publicado`; se isso passar de 1,5 × o valor máximo
  total do item, o valor publicado é tratado como total (item marcado).
- Item com vários vencedores (credenciamento): entra uma vez, dividido igualmente.
  Sem isso, uma única inexigibilidade da Fundação Cultural somava R$ 256 mi (estimado R$ 4,1 mi).
- CPF mascarado (`***.531.***-**`) = pessoa física → origem "sem informação".

## Números de 2026 (publicação TCE-PR de 01/11/2026, SIM-AM até 2026/08)

| | Prefeitura | Todas as entidades |
|---|---:|---:|
| Licitações | 265 | 707 |
| Com vencedor publicado | 233 | 618 |
| Valor estimado | R$ 308,0 mi | R$ 484,8 mi |
| Valor homologado | R$ 178,9 mi | R$ 260,1 mi |
| Foz do Iguaçu | R$ 58,6 mi (32,8%) | R$ 108,4 mi (41,7%) |
| Outras cidades do PR | R$ 103,4 mi (57,8%) | R$ 126,0 mi (48,5%) |
| Outros estados | R$ 16,8 mi (9,4%) | R$ 25,6 mi (9,9%) |
| Sem informação | R$ 0,0 mi (2 fornecedores) | R$ 0,07 mi (32, pessoas físicas) |

Maiores cidades fora de Foz (prefeitura): São Miguel do Iguaçu R$ 32,9 mi (3 licitações),
Santa Helena R$ 30,6 mi (4), Cascavel R$ 10,5 mi, Maringá R$ 6,8 mi, Curitiba R$ 5,9 mi.

**Validação contra o Observatório: não comparável ainda.** O painel do Observatório
usa "todos os períodos" (2.686 licitações, R$ 1,44 bi; Foz 25%). Aqui é só 2026. A
concentração em Mafra (SC) não aparece em 2026 — confirma que veio de anos anteriores.

---

# Fase 3 — explorador (aba Licitações)

**Secretaria** (decisão de 04/11/2026): vem dos empenhos ligados à licitação, direto
(`LicitacaoXEmpenho`) ou via contrato (`LicitacaoXContrato` → `EmpenhoXContrato`).
Cobertura na prefeitura em 2026: **99 de 265 (37%)** — 90 direto, 9 via contrato.
As outras 166 aparecem como "Secretaria não informada" (a maioria ainda sem empenho).
Não se atribui secretaria aleatória nem estimada. Procurar o nome da secretaria no
texto do objeto acharia só 24 de 265, com texto ambíguo; não foi usado.

e-SIC (pendência 5): link aponta para a página do SIC no Portal da Transparência
(`IdLinkItem=206`). Um ofício de 2026 à Câmara relata dificuldades com o e-SIC; conferir.
