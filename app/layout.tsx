import type { Metadata, Viewport } from "next";
import "./globals.css";
import {connection} from 'next/server';

export const metadata: Metadata = {
  title: "Åben Bane HIK",
  description: "Åben Bane – spilleglæde, gode kampe og fællesskab.",
  applicationName: "Åben Bane",
  appleWebApp: {capable:true,title:"Åben Bane",statusBarStyle:"default"},
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/brand/icon-32.png",
    shortcut: "/brand/icon-192.png",
    apple: "/brand/icon-180.png",
  },
};

export const viewport: Viewport = {themeColor:"#042a52"};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonces must be generated per response, never baked into prerendered HTML.
  await connection();
  return (
    <html lang="da">
      <body className="antialiased">{children}<footer className="site-legal-footer mx-auto flex max-w-5xl flex-wrap gap-5 p-6 text-sm"><a href="/privacy">Privatlivsinformation</a><a href="/cookies">Cookieinformation</a></footer></body>
    </html>
  );
}

