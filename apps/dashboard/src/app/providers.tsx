"use client";

import type { ReactNode } from "react";

import { AuthProvider } from "@/lib/auth/context";
import { I18nProvider } from "@/lib/i18n";
import { ProjectProvider } from "@/lib/project-context";
import { ThemeProvider } from "@/lib/theme";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <ProjectProvider>{children}</ProjectProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
