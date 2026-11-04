import Link from "next/link";
import { formatar } from "@/lib/formato";
import type { Registro } from "@/lib/tce/dados";
import type { Coluna } from "@/lib/tce/temas";

const alinhaDireita = (c: Coluna) => c.tipo === "moeda" || c.tipo === "numero";

export function Tabela({
  colunas,
  linhas,
  link,
  vazio = "Nenhum registro.",
}: {
  colunas: Coluna[];
  linhas: Registro[];
  link?: (r: Registro, i: number) => string;
  vazio?: string;
}) {
  if (linhas.length === 0) return <p className="py-6 text-sm text-muted-foreground">{vazio}</p>;
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            {colunas.map((c) => (
              <th key={c.campo} className={`px-2 py-2 font-medium ${alinhaDireita(c) ? "text-right" : ""}`}>
                {c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((r, i) => {
            const href = link?.(r, i);
            return (
              <tr key={i} className="border-b border-border/60 align-top hover:bg-muted/50">
                {colunas.map((c, j) => {
                  const texto = formatar(r[c.campo], c.tipo);
                  const classe = `px-2 py-2 ${alinhaDireita(c) ? "text-right tabular-nums whitespace-nowrap" : ""} ${
                    c.tipo === "longo" ? "max-w-md" : ""
                  } ${c.tipo === "data" ? "whitespace-nowrap" : ""}`;
                  const conteudo =
                    c.tipo === "longo" ? <span className="line-clamp-2" title={texto}>{texto}</span> : texto;
                  return (
                    <td key={c.campo} className={classe}>
                      {href && j === 0 ? (
                        <Link href={href} className="font-medium underline-offset-2 hover:underline">
                          {conteudo || "—"}
                        </Link>
                      ) : (
                        conteudo
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
