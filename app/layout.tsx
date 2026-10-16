import type { Metadata, Viewport } from "next";
import "./globals.css";
import {connection} from 'next/server';

export const metadata: Metadata = {
  title: "HIK Åben Bane",
  description: "Tilmelding og kampplan til HIK Åben Bane.",
  applicationName: "Åben Bane Aften",
  appleWebApp: {capable:true,title:"Åben Bane",statusBarStyle:"default"},
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/AppTennisLogo.png",
    shortcut: "/AppTennisLogo.png",
    apple: "/AppTennisLogo.png",
  },
};

export const viewport: Viewport = {themeColor:"#13375e"};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonces must be generated per response, never baked into prerendered HTML.
  await connection();
  return (
    <html lang="da">
      <body className="antialiased">{children}<footer className="mx-auto flex max-w-5xl flex-wrap gap-5 p-6 text-sm"><a href="/privacy">Privatlivsinformation</a><a href="/cookies">Cookieinformation</a></footer></body>
    </html>
  );
}

