import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { LanguageProvider } from "@/lib/i18n";
import "./globals.css";

// Two deliberate voices: Archivo for the human/natural-language side of the
// UI, IBM Plex Mono for the SQL/data side — a pairing that mirrors what the
// product actually does (language in, SQL out).
const archivo = Archivo({
  variable: "--font-sans",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

const title = "AskQL — pregúntale a tus datos";
const description =
  "Sube un CSV y haz preguntas en lenguaje natural. Todo corre en tu navegador con DuckDB-WASM; un LLM solo ve el esquema, nunca tus datos.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
