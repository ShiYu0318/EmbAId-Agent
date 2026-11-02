import type { Metadata } from "next";
import type { ReactNode } from "react";

import { themeInitScript } from "@/lib/theme";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "EmbAId Agent",
  description: "Management dashboard for the EmbAId Agent platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-TW" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
        <link href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Martian+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
