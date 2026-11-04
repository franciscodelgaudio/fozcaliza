import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import { FlagStripe, SiteFooter, SiteHeader } from "@/components/fz/base";
import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: { default: "Fozcaliza", template: "%s · Fozcaliza" },
  description: "Licitações, contratos, obras e despesas da prefeitura de Foz do Iguaçu, explicados com dados públicos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${publicSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col text-[17px] text-tinta">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-[10px] focus:bg-white focus:px-4 focus:py-2"
        >
          Pular para o conteúdo
        </a>
        <SiteHeader />
        <FlagStripe />
        <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
