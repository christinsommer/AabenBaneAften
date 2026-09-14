import type { Metadata, Viewport } from "next";
import "./globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da">
      <body className="antialiased">{children}</body>
    </html>
  );
}

