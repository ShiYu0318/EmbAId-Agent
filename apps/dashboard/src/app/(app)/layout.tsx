"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import {
  IconBook,
  IconChart,
  IconChat,
  IconGap,
  IconMoon,
  IconSettings,
  IconSparkle,
  IconSun,
} from "@/components/icons";
import { IconButton, LoadingBlock, Select } from "@/components/ui";
import { useAuth } from "@/lib/auth/context";
import { LOCALES, LOCALE_LABELS, useI18n, type Locale } from "@/lib/i18n";
import { useProjects } from "@/lib/project-context";
import { useTheme } from "@/lib/theme";

interface NavItem {
  href: string;
  labelKey: string;
  icon: ReactNode;
}

const NAV: { sectionKey: string; items: NavItem[] }[] = [
  {
    sectionKey: "nav.sectionMain",
    items: [
      { href: "/", labelKey: "nav.overview", icon: <IconChart size={17} /> },
      { href: "/knowledge", labelKey: "nav.knowledge", icon: <IconBook size={17} /> },
      { href: "/playground", labelKey: "nav.playground", icon: <IconChat size={17} /> },
    ],
  },
  {
    sectionKey: "nav.sectionInsight",
    items: [
      { href: "/conversations", labelKey: "nav.conversations", icon: <IconChat size={17} /> },
      { href: "/knowledge-gaps", labelKey: "nav.knowledgeGaps", icon: <IconGap size={17} /> },
      { href: "/analytics", labelKey: "nav.analytics", icon: <IconChart size={17} /> },
    ],
  },
  {
    sectionKey: "nav.sectionConfig",
    items: [
      { href: "/widget", labelKey: "nav.widgetStudio", icon: <IconSparkle size={17} /> },
      { href: "/settings", labelKey: "nav.settings", icon: <IconSettings size={17} /> },
    ],
  },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { ready, user, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const { theme, toggle } = useTheme();
  const { projects, currentId, setCurrentId } = useProjects();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div className="app-loading">
        <LoadingBlock label={t("common.loading")} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <span className="app-brand-mark">proprAI</span>
          <span className="app-brand-sub">Chat</span>
        </div>

        <div className="app-project-picker">
          <Select
            aria-label={t("project.picker")}
            value={currentId ?? ""}
            onChange={(e) => setCurrentId(e.target.value)}
          >
            {projects.length === 0 ? (
              <option value="">{t("project.noProjects")}</option>
            ) : (
              projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))
            )}
          </Select>
        </div>

        <nav className="app-nav">
          {NAV.map((section) => (
            <div key={section.sectionKey} className="app-nav-section">
              <span className="app-nav-heading">{t(section.sectionKey)}</span>
              {section.items.map((item) => {
                const active =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={active ? "app-nav-link active" : "app-nav-link"}
                  >
                    {item.icon}
                    <span>{t(item.labelKey)}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          <div className="app-sidebar-controls">
            <IconButton label={t("nav.theme")} onClick={toggle}>
              {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
            </IconButton>
            <Select
              aria-label={t("nav.language")}
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              {LOCALES.map((code) => (
                <option key={code} value={code}>
                  {LOCALE_LABELS[code]}
                </option>
              ))}
            </Select>
          </div>
          <button type="button" className="app-logout" onClick={() => logout()}>
            {t("auth.logout")}
          </button>
        </div>
      </aside>

      <main className="app-main">{children}</main>
    </div>
  );
}
