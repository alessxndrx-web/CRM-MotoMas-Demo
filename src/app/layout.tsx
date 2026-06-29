import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MotoMas",
  description: "Plataforma ERP + CRM multi-sucursal para MotoMas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full bg-[#050505] text-zinc-100">{children}</body>
    </html>
  );
}
