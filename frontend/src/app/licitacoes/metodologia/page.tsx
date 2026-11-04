import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { GESTOES, rotuloGestao } from "@/lib/licitacoes/gestao";
import { SINAIS } from "@/lib/licitacoes/sinais";

export const metadata: Metadata = { title: "Metodologia · Licitações e obras" };

function Secao({ titulo, id, children }: { titulo: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-4 flex-col gap-3">
      <h2 className="border-t-2 border-tinta pt-4 text-[26px] font-extrabold">{titulo}</h2>
      {children}
    </section>
  );
}

export default function Page() {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6 text-[17px] leading-relaxed sm:px-6">
      <header className="flex flex-col gap-2">
        <Link href="/licitacoes/explorar" className="inline-flex min-h-11 w-fit items-center text-[15px] font-semibold text-verde-700 hover:text-verde-800">
          ← Voltar para o explorador
        </Link>
        <h1 className="text-[clamp(30px,4.5vw,44px)] leading-tight font-extrabold tracking-[-0.025em] text-tinta">Como os números são calculados</h1>
        <p className="text-cinza-700">
          Esta página explica de onde vem cada número da seção Licitações e obras e quais escolhas foram feitas quando os dados
          públicos estavam incompletos ou ambíguos. Ela cresce conforme novas partes da seção ficam prontas.
        </p>
      </header>

      <Secao titulo="Fontes">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>TCE-PR — Portal Informação para Todos</strong> (
            <a className="text-verde-700 underline" href="https://pit.tce.pr.gov.br/Dados/DadosConsulta/Consolidado">
              Download de Dados
            </a>
            ): licitações, participantes, itens vencidos, contratos e empenhos. O arquivo é gerado toda semana com as remessas
            mensais do SIM-AM já fechadas, por isso fica de 2 a 3 meses atrás do calendário. São dados declarados pelas próprias
            entidades e podem mudar.
          </li>
          <li>
            <strong>Receita Federal — CNPJ</strong> (dados abertos, consultados via{" "}
            <a className="text-verde-700 underline" href="https://minhareceita.org">
              minhareceita.org
            </a>
            ): município, UF e data de abertura de cada fornecedor.
          </li>
          <li>
            <strong>IBGE</strong> (API de localidades): nome oficial de cada município.
          </li>
        </ul>
      </Secao>

      <Secao titulo="Quem comprou">
        <p>
          O padrão é mostrar só a <strong>prefeitura</strong> (Município de Foz do Iguaçu). Fundação de Saúde, Fundação Cultural,
          Câmara, FozPrev, FozHabita e Foztrans ficam disponíveis no filtro “Quem comprou”.
        </p>
        <p>
          A <strong>secretaria</strong> não vem no arquivo de licitações. Ela é tirada dos empenhos ligados à licitação (direto ou
          pelo contrato). Quando a licitação ainda não tem empenho publicado, aparece “Secretaria não informada” — a secretaria nunca
          é estimada. Quando há empenhos de mais de uma secretaria, mostramos a de maior valor e quantas outras existem.
        </p>
      </Secao>

      <Secao titulo="Valor contratado">
        <p>
          O valor contratado de uma licitação é a <strong>soma dos itens vencidos</strong> publicados pelo TCE-PR. O valor estimado
          aparece à parte. Licitações sem vencedor publicado não entram na soma do contratado.
        </p>
        <p>Dois ajustes são necessários, e os itens ajustados ficam marcados na ficha:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Valor unitário ou total.</strong> O TCE-PR às vezes publica o preço unitário e às vezes o total do item no mesmo
            campo. Se quantidade × valor publicado passar de 1,5 vez o valor máximo total do item, o valor publicado é tratado como
            total.
          </li>
          <li>
            <strong>Credenciamentos.</strong> Quando vários fornecedores são credenciados para o mesmo item, cada um aparece com o
            valor inteiro do item. O valor entra uma vez só e é dividido igualmente entre eles.
          </li>
        </ul>
        <p>
          O <strong>desconto obtido</strong> é 1 − contratado ÷ estimado, usando o estimado só dos itens que tiveram vencedor. Fica em
          laranja quando é de 2% ou menos.
        </p>
      </Secao>

      <Secao titulo="Origem do fornecedor">
        <p>
          Pelo endereço do CNPJ na Receita: <strong>Foz do Iguaçu</strong>, <strong>outras cidades do PR</strong>,{" "}
          <strong>outros estados</strong> ou <strong>sem informação</strong> (pessoa física, CNPJ inválido, não encontrado ou sem
          endereço). “Sem informação” sempre aparece, mesmo quando é zero. Nomes de pessoas físicas não são mostrados.
        </p>
      </Secao>

      <Secao titulo="Sinais de risco" id="sinais">
        <p>
          Cada licitação é checada contra sete sinais, inspirados nos indicadores de risco em compras públicas usados pelo FMI (2022).
          Um sinal <strong>não prova irregularidade</strong>: mostra onde vale perguntar. Cada sinal pode estar presente, ausente, sem
          informação (o dado não foi publicado) ou não se aplicar à modalidade. Dado faltante nunca conta como presente nem como
          ausente.
        </p>
        <ol className="list-decimal space-y-2 pl-6">
          {SINAIS.map((d) => (
            <li key={d.id}>
              <strong>{d.titulo}.</strong> {d.regra}
            </li>
          ))}
        </ol>
        <p>
          Os limites dos sinais 5 e 6 são calculados sobre todas as licitações do ano, de todas as entidades. Feriados não são
          descontados dos dias úteis do sinal 4. O sinal 7 acende com frequência em credenciamentos, em que muitas empresas pequenas e
          novas se cadastram para prestar o mesmo serviço.
        </p>
      </Secao>

      <Secao titulo="Portal nacional (PNCP)" id="pncp">
        <p>
          Desde a Lei 14.133/2021, editais, atas e contratos precisam ser publicados no{" "}
          <a className="text-verde-700 underline" href="https://pncp.gov.br">
            Portal Nacional de Contratações Públicas
          </a>
          . Baixamos as contratações publicadas por órgãos de Foz do Iguaçu e a lista de documentos de cada uma. A licitação do TCE-PR é
          ligada à compra do PNCP pelo <strong>número do processo administrativo</strong>, na mesma entidade; só vale quando há uma única
          compra com aquele número. A ficha mostra a data de publicação no PNCP e os documentos, com link direto.
        </p>
      </Secao>

      <Secao titulo="Houve disputa?">
        <p>
          O passo “Houve disputa?” da explicação separa as licitações com vencedor em grupos: pregões e concorrências com duas ou mais
          empresas participantes, com uma só, e compras feitas sem licitar (dispensa e inexigibilidade). Para cada grupo, mostra a soma
          do contratado dividida pela soma do estimado dos itens vencidos. 100% quer dizer que se pagou exatamente o estimado.
        </p>
        <p>
          A comparação não é por número de sinais porque a dispensa e a inexigibilidade (sinal 2) quase sempre pagam o valor fixado no
          edital. Misturar modalidades faria a diferença de preço parecer efeito dos sinais, quando o que muda é a modalidade.
        </p>
      </Secao>

      <Secao titulo="Obras" id="obras">
        <p>
          As obras vêm do <strong>cadastro de obras do SIM-AM</strong> (arquivos “Intervenção” do TCE-PR), de 2013 até hoje. Quem
          informa a situação (em andamento, paralisada, não iniciada, concluída) é a própria prefeitura. Os arquivos de anos antigos
          deixam de ser atualizados pelo TCE-PR; quando a informação de uma obra tem mais de três meses de atraso em relação à última
          remessa, ela aparece como “Informação de mês/ano” e fica fora das contas da explicação.
        </p>
        <p>Além da situação declarada, o site faz duas leituras próprias, só para obras declaradas em andamento:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Sem medição há 6+ meses</strong>: seis meses ou mais entre a última medição informada (ou o início, se nunca houve
            medição) e a data da informação. Na prática, a obra pode estar parada.
          </li>
          <li>
            <strong>Prazo vencido</strong>: a data de início mais o prazo de execução já passou. O prazo é o original; prorrogações por
            aditivo não aparecem no cadastro de obras.
          </li>
        </ul>
        <p>
          <strong>Contrato pago.</strong> O TCE-PR não publica quanto de cada obra foi feito, nem qual contrato é o da obra. O contrato
          é procurado pelo <strong>valor exato</strong> da obra, ao centavo, na mesma entidade, assinado até 60 dias depois do início.
          Só vale quando há um único contrato assim. O valor pago é a soma das liquidações dos empenhos ligados ao contrato, dividida
          pelo valor atualizado pelo último aditivo. A liquidação costuma acontecer depois de cada medição, mas pago não é o mesmo que
          feito: adiantamentos e medições atrasadas distorcem. Contratos e liquidações foram baixados a partir de 2022.
        </p>
        <p>
          <strong>Obrasgov.br.</strong> Obras com recurso federal são cadastradas pelo gestor no Obrasgov.br, que publica o percentual
          de execução física e o histórico de paralisações. Quando uma obra do TCE-PR corresponde a um projeto do Obrasgov, a ficha
          mostra os dois.
        </p>
      </Secao>

      <Secao titulo="Gestão">
        <p>A gestão é definida pela data de abertura da licitação (ou do edital, se faltar a abertura).</p>
        <div className="overflow-x-auto rounded-xl border border-linha">
          <table className="w-full min-w-[520px] text-left text-[15px]">
            <thead className="bg-fundo-alt text-[13px] tracking-[.06em] text-cinza-600 uppercase">
              <tr>
                <th className="px-3 py-2">Gestão</th>
                <th className="px-3 py-2">Prefeito</th>
                <th className="px-3 py-2">Partido</th>
                <th className="px-3 py-2">Observação</th>
              </tr>
            </thead>
            <tbody>
              {GESTOES.map((g) => (
                <tr key={g.rotulo} className="border-t border-linha align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{rotuloGestao(g.rotulo)}</td>
                  <td className="px-3 py-2">{g.prefeito}</td>
                  <td className="px-3 py-2">{g.partido}</td>
                  <td className="px-3 py-2 text-cinza-700">{g.observacao ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao titulo="Limitações conhecidas">
        <ul className="list-disc space-y-2 pl-6">
          <li>Licitações: por enquanto só há dados de 2026. Obras: de 2013 a 2026.</li>
          <li>Muitos pregões não têm participantes publicados no TCE-PR; nesses casos a ficha diz isso em vez de supor um número.</li>
          <li>
            O sinal 3 depende do número do processo informado ao TCE-PR. Se a prefeitura informa um número diferente do que publicou no
            PNCP, a licitação aparece como fora do portal sem estar; por isso a ficha mostra o número procurado.
          </li>
          <li>O PNCP publica só os vencedores, não a lista de participantes; pregões sem participantes no TCE-PR continuam sem essa informação.</li>
          <li>O percentual físico de cada obra não é publicado pelo TCE-PR; só aparece para obras com recurso federal no Obrasgov.br.</li>
          <li>O sinal 6 só é calculado quando a secretaria é conhecida (cerca de 4 em cada 10 licitações da prefeitura).</li>
          <li>Os itens não têm código de catálogo (CATMAT/CATSER); a comparação de preços com outras prefeituras depende do PNCP.</li>
        </ul>
      </Secao>
    </article>
  );
}
