import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { GESTOES, rotuloGestao } from "@/lib/licitacoes/gestao";

export const metadata: Metadata = { title: "Metodologia · Licitações e obras" };

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[26px] font-bold text-verde-900">{titulo}</h2>
      {children}
    </section>
  );
}

export default function Page() {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8 text-[17px] leading-relaxed">
      <header className="flex flex-col gap-2">
        <Link href="/licitacoes/explorar" className="inline-flex min-h-11 w-fit items-center text-[15px] text-verde-700 underline underline-offset-2">
          ← Voltar para o explorador
        </Link>
        <h1 className="text-[clamp(30px,4.5vw,44px)] leading-tight font-extrabold text-verde-900">Como os números são calculados</h1>
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
          <li>Por enquanto só há dados de 2026.</li>
          <li>Muitos pregões não têm participantes publicados no TCE-PR; nesses casos a ficha diz isso em vez de supor um número.</li>
          <li>Os itens não têm código de catálogo (CATMAT/CATSER); a comparação de preços com outras prefeituras depende do PNCP.</li>
        </ul>
      </Secao>
    </article>
  );
}
