import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gemini 2.5 Nano Banana Tech Demo",
  description: "Kép feltöltés, Gemini 2.5 képgenerálás és válaszidő mérés.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hu">
      <body>{children}</body>
    </html>
  );
}
