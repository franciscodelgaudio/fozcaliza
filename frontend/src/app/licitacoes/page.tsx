import { redirect } from "next/navigation";

// A história guiada em 8 passos chega na fase 4. Até lá, cada passo fica oculto
// (não há passo com dado fictício) e a seção abre direto no explorador.
export default function Page() {
  redirect("/licitacoes/explorar");
}
