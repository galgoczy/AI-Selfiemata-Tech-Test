import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Viking Image Generator – Gemini 2.5 Tech Demo",
  description:
    "Upload a photo and let Gemini 2.5 Flash transform it into a Viking scene. Technical demo measuring API response time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hu">
      <body className="antialiased">{children}</body>
    </html>
  );
}
