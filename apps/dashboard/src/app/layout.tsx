import type { Metadata } from "next";
import type { ReactNode } from "react";

import { themeInitScript } from "@/lib/theme";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "proprAI Chat",
  description: "Management dashboard for the proprAI Chat platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-TW" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
