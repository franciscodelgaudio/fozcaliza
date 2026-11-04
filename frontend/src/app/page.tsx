import { Suspense } from "react";
import { Carregando } from "@/components/filtros";
import { VisaoAno } from "@/components/visao-ano";
import { anos } from "@/lib/tce/dados";

export default function Home() {
  return (
    <Suspense fallback={<Carregando />}>
      <UltimoAno />
    </Suspense>
  );
}

async function UltimoAno() {
  const [ano] = await anos();
  if (!ano) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum XML em <code>dados/tce</code>. Rode <code>node scripts/baixar-tce.mjs</code> na raiz do repositório.
      </p>
    );
  }
  return <VisaoAno ano={ano} />;
}
