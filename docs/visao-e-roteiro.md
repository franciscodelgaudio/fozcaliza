# Fozcaliza — Visão do projeto e roteiro de entregas

Oct 30, 2026 · @Francisco

## Cerne do objetivo

Mostrar a qualquer pessoa de Foz do Iguaçu, em linguagem simples e com prova em cada número, o que a prefeitura faz com o dinheiro público, para quem ele vai, por decisão de quem, e se os serviços estão melhorando ou piorando, comparando gestões com as mesmas regras.

O público é o cidadão comum, que chega pelo celular, muitas vezes por um link compartilhado no WhatsApp. Jornalistas, vereadores, conselhos municipais e o Observatório Social são um público secundário, que vai usar os dados brutos e a API.

## Princípios

Toda entrega só vai ao ar se cumprir estas cinco regras.

1. **Todo número tem fonte, data e metodologia** a um clique de distância. O dado bruto fica como a fonte publicou; ajustes (inflação, per capita, percentuais) acontecem só na camada de indicadores.
2. **Alertas, não acusações.** Critérios objetivos e públicos, documentos de origem e espaço para resposta.
3. **As mesmas regras para todas as gestões**, definidas antes de olhar os resultados.
4. **A melhora tem o mesmo destaque que a piora.**
5. **A falta de dado também é dado.** Atrasos, omissões e pedidos de informação negados aparecem no site.

Três cuidados de método acompanham todas as entregas: comparar sempre em valores reais e por habitante, nunca atribuir a um prefeito o que é competência do estado ou da União, e nunca sugerir causa a partir de duas séries que só andam juntas.

## As frentes

O projeto responde a cinco perguntas, e cada entrega abaixo avança uma ou mais delas.

| Frente | Pergunta que responde | Entregas |
| --- | --- | --- |
| Dinheiro | De onde vem e para onde vai o dinheiro da cidade? | 1, 2, 3, 6 |
| Compras | Quem vende para a prefeitura, como foi escolhido e o que merece atenção? | 1, 4, 5 |
| Decisões | Quem decidiu cada política e o que foi prometido? | 7 |
| Serviços | A vida na cidade está melhorando ou piorando? | 8 |
| Transparência | A prefeitura cumpre suas obrigações de informar? | 9 |

## Onde estamos

A despesa está bem coberta: o agregado por função desde 2017 e o detalhe por empenho e credor desde 2025. O frontend ainda é só o esqueleto.

**Stack:** FastAPI + PostgreSQL (Neon) no backend, Next.js no frontend, ETL em Python agendado diariamente no GitHub Actions.

**Como o ETL funciona:** coleta incremental (checa o extrato de entregas do Siconfi ou o Last-Modified do TCE e compara o hash), versionamento sem sobrescrita (`valido_de` / `valido_ate`) e proveniência em toda linha (coleta, fonte, endpoint, hash, sha do git).

| Fonte | O que já entra | Tabelas |
| --- | --- | --- |
| Siconfi: extrato de entregas | Status de cada RREO, RGF, DCA e MSC | `ENTREGA_DEMONSTRATIVO` |
| Siconfi: RREO, RGF, DCA | Despesa por função, subfunção e estágio; RCL, pessoal, dívida | `SICONFI_LINHA`, `DESPESA`, `APURACAO_OFICIAL` |
| Portarias SOF/MOG | Funções e subfunções com vigência | `CLASSIFICACAO_OFICIAL` |
| TCE-PR (PIT, SIM-AM) | Empenhos, movimentos, contratos, aditivos, licitações, credores | `EMPENHO`, `EMPENHO_MOVIMENTO`, `CONTRATO`, `CONTRATO_ADITIVO`, `LICITACAO`, `VINCULO`, `CREDOR` |
| TCE-PR: entidades | Prefeitura, Câmara, autarquias, fundações, RPPS | `UNIDADE_GESTORA` |
| IBGE (SIDRA) | Estimativas anuais e Censo 2022 | `POPULACAO_OBSERVACAO`, `NOTA_SERIE` |

**Ainda vazio no MER:** `RECEITA`, `RESULTADO_OBSERVACAO`, `INDICE_PRECOS_SERIE/VALOR`, `GESTAO`, `MUNICIPIO_ATRIBUTO`, `GRUPO_PARES*`, `CLASSIFICACAO_EQUIVALENCIA`, as classificações de natureza da despesa, natureza da receita e fonte de recurso, e toda a camada derivada (`INDICADOR*`, `EXECUCAO_*`).

## Preparação antes da Entrega 1

São pendências de poucos dias que destravam as entregas seguintes ou evitam perda de dados.

- [ ] Fazer o commit de `ibge.py`, `apuracao.py` e `tce_painel.py`.
- [ ] Ligar o `tce_painel.py` ao `__main__.py` e ao workflow, para os mínimos de educação (MDE) e saúde (ASPS) entrarem em `APURACAO_OFICIAL`.
- [ ] Trocar o `podar` por arquivamento: exportar o que sai da janela para Parquet num storage barato (Cloudflare R2 ou S3) e consultar com DuckDB quando preciso. Apagar contradiz os princípios 1 e 3.
- [ ] Estender o detalhe do TCE-PR pelo menos até a gestão anterior (2021 a 2024), para que os alertas de fornecedores tenham histórico.
- [ ] Conferir o horário do cron: o GitHub Actions usa UTC, então 04:30 no workflow é 01:30 em Brasília.
- [ ] Decidir onde o CPF de credores pessoa física é mascarado. Sugestão: guardar completo no banco e nunca expor completo pela API.
- [ ] Tornar as migrations a fonte da verdade do schema e gerar o diagrama a partir do banco, deixando o `.drawio` só para a visão conceitual.

## Entrega 1 — Quem recebeu

**Pergunta:** quem mais recebeu dinheiro da prefeitura e por quê? É a primeira entrega porque os dados já estão no banco e o tema interessa a qualquer pessoa.

**O que o cidadão vê:**

- Ranking dos credores que mais receberam no ano, com o valor pago e o percentual do total.
- Uma página por credor: o que foi pago, por qual órgão, em qual área, com o objeto de cada empenho e o contrato ou licitação de origem, quando houver.
- Filtros por ano, órgão (unidade gestora) e área (função).
- Em cada valor, a fonte e a data da última coleta.

**Dados:** `EMPENHO`, `EMPENHO_MOVIMENTO`, `CREDOR`, `UNIDADE_GESTORA`, `VINCULO`, `CONTRATO` e `LICITACAO`, todos já coletados (2025 em diante).

**Pronto quando:**

- [ ] A soma dos pagamentos por credor bate com o total pago do período no TCE-PR, e a diferença, se houver, está explicada na ficha.
- [ ] Folha de pagamento, repasses ao RPPS e transferências obrigatórias aparecem separados dos fornecedores, para o ranking não ser dominado pelo óbvio.
- [ ] CPFs de pessoas físicas aparecem mascarados.
- [ ] Existe uma ficha metodológica da página.
- [ ] Cada página de credor fica boa quando compartilhada no WhatsApp (título, resumo e imagem de prévia).

**Cuidado:** "recebeu muito" não é acusação. A página mostra o que foi pago e por quê, sem adjetivos.

## Entrega 2 — Para onde foi o dinheiro

**Pergunta:** quanto a cidade gasta em cada área, e isso mudou de uma gestão para outra?

**O que o cidadão vê:**

- Gasto por área (saúde, educação, segurança e as demais funções), em reais de hoje e por habitante, de 2017 em diante.
- Comparação por gestão, com os anos de transição marcados (o primeiro ano de cada mandato executa o orçamento aprovado pela gestão anterior).
- Orçado versus executado em cada área.
- Os mínimos constitucionais de educação (25%) e saúde (15%) como a fonte oficial apurou, sem recálculo próprio.

**Dados:** `DESPESA` e `APURACAO_OFICIAL`, já coletados. Faltam `INDICE_PRECOS` (IPCA, pelo SIDRA) e `GESTAO` (prefeitos e mandatos, preenchida à mão), além da camada `INDICADOR*`.

**Pronto quando:**

- [ ] Os indicadores de gasto real per capita estão em `INDICADOR_VALOR`, com versão de metodologia.
- [ ] A ficha registra o deflator escolhido (IPCA médio do ano ou de dezembro) e o ano-base.
- [ ] A quebra de população de 2022 aparece anotada nos gráficos per capita.
- [ ] Segurança pública traz a ressalva de que a maior parte é responsabilidade do estado.

**Cuidado:** nenhum gráfico com dois eixos verticais e nenhuma frase que atribua causa ("cortou e por isso piorou").

## Entrega 3 — De onde vem o dinheiro

**Pergunta:** quanto a cidade arrecada, de onde vem esse dinheiro e quanto ela deixa de arrecadar?

**O que o cidadão vê:**

- Receita por origem: impostos próprios (IPTU, ISS), transferências do estado e da União, royalties de Itaipu.
- Uma página só sobre os royalties de Itaipu: quanto entra por ano, em valores reais, e o peso no orçamento.
- Renúncia fiscal: isenções e anistias de IPTU e ISS, e quanto a cidade deixa de arrecadar com elas.
- Contribuição de iluminação pública: quanto é arrecadado versus quanto é gasto com iluminação.

**Dados:** `RECEITA` (vazia), a classificação de natureza da receita em `CLASSIFICACAO_OFICIAL` e a de fonte de recurso com a equivalência da padronização de 2023 (`CLASSIFICACAO_EQUIVALENCIA`). A renúncia está no anexo de metas fiscais da LDO e nos projetos de isenção da Câmara.

**Pronto quando:**

- [ ] A receita distingue bruta, deduções e líquida.
- [ ] Os indicadores de percentual da receita (Entrega 2) passam a usar `RECEITA` como denominador.
- [ ] A série de fontes de recurso atravessa 2023 sem quebra, ou a quebra está anotada.

**Cuidado:** royalties distorcem comparações com outras cidades. Toda comparação de capacidade de gasto mostra os números com e sem royalties.

## Entrega 4 — Licitações, contratos e obras

**Pergunta:** como a prefeitura escolhe quem contrata, e o que foi contratado está sendo entregue?

**O que o cidadão vê:**

- Cada licitação com quem concorreu (não só quem venceu), a modalidade, o valor estimado e o contratado.
- Cada contrato com seus aditivos, o valor inicial e o atual, e o percentual acrescido.
- Contratações diretas (dispensa e inexigibilidade) separadas das licitações.
- Obras: valor contratado versus executado, prazo e situação (em andamento, atrasada, parada, concluída).
- Convênios e emendas parlamentares recebidos, incluindo as transferências especiais ("emendas Pix"), e convênios com Itaipu, se houver.
- Concessões (transporte, estacionamento rotativo, iluminação) com as obrigações de cada contrato.

**Dados:** `LICITACAO`, `CONTRATO` e `CONTRATO_ADITIVO` já entram pelo TCE-PR. Faltam participantes, o PNCP (contratações pela nova lei de licitações, com API de consultas) e o Transferegov (convênios e emendas).

**Pronto quando:**

- [ ] Uma mesma contratação vinda do TCE-PR e do PNCP é reconhecida como a mesma, sem duplicar.
- [ ] Existe a tabela de participantes, necessária para a Entrega 5.
- [ ] As obrigações de cada concessão estão registradas, para servirem de régua na Entrega 8.

**Cuidado:** aditivo não é irregularidade em si. A página mostra o percentual e o limite legal, sem julgar.

## Entrega 5 — Compras que merecem atenção

**Pergunta:** quais compras fogem do padrão e deveriam ser examinadas por quem fiscaliza?

**O que o cidadão vê:** uma lista de alertas, cada um com o critério que o disparou, os documentos de origem e a resposta da prefeitura ou da empresa, quando houver.

**Critérios, em duas levas:**

1. Primeira leva (simples e fáceis de validar):
   - empresa aberta pouco antes de ganhar o contrato;
   - licitação com um único participante;
   - aditivos que somam perto ou acima do limite legal.
2. Segunda leva:
   - atividade da empresa (CNAE) incompatível com o objeto;
   - os mesmos participantes revezando a vitória;
   - várias contratações diretas do mesmo objeto logo abaixo do limite de dispensa;
   - preço unitário muito acima da mediana do mesmo item;
   - sócio do fornecedor que é servidor ou doador de campanha (TSE);
   - concentração de uma área em poucos fornecedores.

**Dados:** Entrega 4, mais os dados abertos de CNPJ da Receita Federal (sócios, abertura, CNAE) e as prestações de contas eleitorais do TSE.

**Pronto quando:**

- [ ] Cada critério tem ficha própria, com a regra exata e os falsos positivos conhecidos.
- [ ] Existe um canal de resposta, e a resposta é publicada ao lado do alerta.
- [ ] A redação dos alertas passou por revisão jurídica.
- [ ] Os primeiros alertas foram validados por terceiros (o Observatório Social de Foz é um candidato).

**Cuidado:** é a entrega de maior risco jurídico. Usar sempre "alerta" ou "merece atenção", nunca "irregular" ou "superfaturado".

## Entrega 6 — Pessoal, previdência e dívida

**Pergunta:** quanto custa a máquina pública e que contas ela deixa para o futuro?

**O que o cidadão vê:**

- Folha de pagamento: total real por habitante, efetivos versus comissionados, terceirizados, horas extras e salários acima do teto.
- Gasto com pessoal versus o limite da LRF, como a fonte oficial apurou.
- Previdência própria (RPPS): déficit atuarial ao longo do tempo e repasses em dia ou atrasados.
- Dívida consolidada e precatórios.
- Diárias e viagens por órgão.

**Dados:** os limites de pessoal e de dívida já estão em `APURACAO_OFICIAL` (RGF). Faltam a folha detalhada (portal de transparência da prefeitura ou TCE-PR), o CADPREV para o RPPS e as diárias.

**Pronto quando:**

- [ ] Comissionados e efetivos são contados da mesma forma em todas as gestões.
- [ ] O déficit atuarial vem acompanhado de uma explicação de uma frase sobre o que ele significa.

**Cuidado:** o STF já decidiu que nome e salário de servidor podem ser divulgados, mas CPF e dados pessoais não. A página de servidores mostra cargo e remuneração, sem dados pessoais.

## Entrega 7 — Decisões: leis, políticas, Câmara e promessas

**Pergunta:** quem decidiu cada política da cidade, quanto ela custa e o que foi prometido?

**O que o cidadão vê:**

- Uma página por política pública (o passe livre é o primeiro exemplo), ligando:
  1. a lei que a criou, com autor, data e votação nominal;
  2. quanto ela custa e de onde sai o dinheiro;
  3. as propostas de alteração ou revogação, com autor, justificativa e situação;
  4. os decretos do Executivo sobre o tema;
  5. as promessas relacionadas do plano de governo.
- Uma página por vereador: projetos apresentados, presença e votos.
- Os gastos da própria Câmara (assessores, diárias, verba de gabinete).
- Acompanhamento das promessas do plano de governo do prefeito: cumprida, em andamento, não iniciada, abandonada.
- Atas dos conselhos municipais (saúde, educação, assistência) sobre cada política.

**Dados:** o SAPL da Câmara de Foz (proposições, autores, tramitação e votos, se a API estiver aberta), o Querido Diário para os decretos e o TSE para os planos de governo.

**Pronto quando:**

- [ ] Cada política mostra a justificativa oficial de cada lado, nas palavras dos próprios documentos.
- [ ] O status de cada promessa tem critério escrito e link para a evidência.

**Cuidado:** é a entrega com mais curadoria manual. Ligar uma lei a uma ação orçamentária exige leitura, e o site perde credibilidade se parecer ter lado.

## Entrega 8 — Serviços públicos

**Pergunta:** a vida na cidade está melhorando ou piorando?

Cada serviço é medido em quatro camadas: oferta (o que existe), produção (o que foi feito), resultado (o que o cidadão sente) e percepção (reclamações). Reclamações sozinhas não provam piora, porque crescem quando o canal fica mais fácil.

| Área | Indicadores principais | Fontes |
| --- | --- | --- |
| Transporte | Frota contratada versus operante, viagens programadas versus realizadas, idade da frota, ar-condicionado, oferta semanal por linha | Contrato de concessão, GTFS histórico, LAI |
| Saúde | UBS ativas, equipes e profissionais, consultas por mês, licitações de medicamentos desertas ou fracassadas | CNES, DATASUS, SISAB, Entrega 4, LAI |
| Educação | Fila de vagas em creche, IDEB, infraestrutura das escolas | LAI, INEP (Censo Escolar, IDEB) |
| Zeladoria | Chamados de buracos, lixo, poda e iluminação por bairro, tempo até o atendimento, asfalto comprado | Ouvidoria (LAI), Entrega 4, levantamento próprio em rotas fixas |
| Assistência social | Pessoas no CadÚnico, CRAS, população em situação de rua | CadÚnico, LAI |
| Drenagem e habitação | Pontos de alagamento, fila de moradia | LAI, Defesa Civil |

**Mudanças no modelo:** indicadores com granularidade mensal e recorte territorial (bairro, linha, unidade); as tabelas `PEDIDO_LAI` e `RELATO_CIDADAO`.

**Pronto quando:**

- [ ] Cada indicador tem série histórica que alcança pelo menos a gestão anterior.
- [ ] A sazonalidade é tratada (mesmo mês entre anos ou média móvel de 12 meses).
- [ ] As áreas que melhoraram aparecem com o mesmo destaque das que pioraram.

**Cuidado:** saneamento é da Sanepar e criminalidade é do estado. Entram só como contexto, nunca como nota do prefeito.

## Entrega 9 — Transparência da própria prefeitura

**Pergunta:** a prefeitura cumpre suas obrigações de informar a população?

**O que o cidadão vê:**

- Entregas dos relatórios fiscais obrigatórios (RREO, RGF, DCA, MSC): no prazo, atrasadas ou ausentes, por gestão.
- Pedidos de informação feitos pelo Fozcaliza: o que foi pedido, quando, se a resposta veio no prazo e se veio completa.
- Um quadro-resumo de transparência por gestão, com critérios publicados.

**Dados:** `ENTREGA_DEMONSTRATIVO` já cobre os relatórios fiscais, então essa parte pode ir ao ar a qualquer momento, inclusive antes da ordem prevista. Os pedidos de LAI começam a ser registrados na Entrega 8.

**Pronto quando:**

- [ ] O prazo legal de cada relatório está registrado, para "atrasado" ter critério objetivo.
- [ ] Pedidos negados mostram a justificativa dada e o recurso apresentado.

## Cuidados jurídicos, LGPD e neutralidade

O site só se sustenta se for juridicamente seguro e politicamente neutro, porque um erro grave contamina todo o resto.

- **Difamação:** um alerta falso apresentado como fato pode gerar ação por calúnia ou difamação. Daí a regra de "alerta, não acusação", a revisão jurídica da Entrega 5 e o canal de resposta.
- **LGPD:** CPFs sempre mascarados na exibição; dados pessoais de servidores fora do site; nada de pessoas físicas na API pública além do necessário.
- **Neutralidade:** as mesmas regras para todas as gestões, a justificativa oficial de cada lado nas políticas disputadas, as melhoras com o mesmo destaque das pioras, e nenhum adjetivo nos títulos.
- **Correções:** quando o site errar, a correção é publicada com data numa página de erratas. Isso protege mais do que tentar nunca errar.
- **Parcerias:** validar alertas e metodologias com o Observatório Social de Foz ou com pesquisadores locais antes da publicação reduz o risco e aumenta a credibilidade.
