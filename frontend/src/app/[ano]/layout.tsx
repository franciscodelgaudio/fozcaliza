import { Container } from "@/components/fz/base";

// Páginas de dados brutos do TCE-PR: largura padrão.
export default function Layout({ children }: LayoutProps<"/[ano]">) {
  return <Container className="py-6">{children}</Container>;
}
