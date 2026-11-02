"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import {
  IconBook,
  IconChart,
  IconChat,
  IconGap,
  IconKey,
  IconLogOut,
  IconMenu,
  IconMoon,
  IconSettings,
  IconSparkle,
  IconSun,
  IconTranslate,
} from "@/components/icons";
import { CommandPalette, type Command } from "@/components/command-palette";
import { DashboardBot } from "@/components/dashboard-bot";
import { OnboardingBar } from "@/components/onboarding-bar";
import { NEW_PROJECT_EVENT } from "@/components/page";
import { ProjectWizard } from "@/components/project-wizard";
import { IconButton, LoadingBlock, Select } from "@/components/ui";
import { useAuth } from "@/lib/auth/context";
import { LOCALES, useI18n } from "@/lib/i18n";
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
      { href: "/embed", labelKey: "nav.embed", icon: <IconKey size={17} /> },
      { href: "/settings", labelKey: "nav.settings", icon: <IconSettings size={17} /> },
    ],
  },
];

const MIN_WIDTH = 240;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 300;
const WIDTH_KEY = "embaid.sidebar.width.v2";

// Roughly a 1:5 split — the sidebar takes about one sixth of the viewport.
function proportionalWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(window.innerWidth / 6)));
}
const COLLAPSED_KEY = "embaid.sidebar.collapsed";

function AccountBlock() {
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const { theme, toggle } = useTheme();

  const name = user?.display_name?.trim() || user?.email || "";
  const initial = (name.charAt(0) || "?").toUpperCase();
  const avatar = user?.avatar_url ?? null;

  const cycleLocale = () => {
    const index = LOCALES.indexOf(locale);
    setLocale(LOCALES[(index + 1) % LOCALES.length]);
  };

  return (
    <div className="app-account">
      <span className="app-account__avatar" aria-hidden>
        {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : initial}
      </span>
      <span className="app-account__name" title={name}>
        {name}
      </span>
      <div className="app-account__actions">
        <IconButton label={t("nav.theme")} onClick={toggle}>
          {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
        </IconButton>
        <IconButton label={t("nav.language")} onClick={cycleLocale}>
          <IconTranslate size={16} />
        </IconButton>
        <IconButton label={t("auth.logout")} onClick={() => logout()}>
          <IconLogOut size={16} />
        </IconButton>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { ready, user } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const { projects, current, currentId, setCurrentId } = useProjects();
  const { toggle: toggleTheme } = useTheme();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(DEFAULT_WIDTH);
  const asideRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    const open = () => setWizardOpen(true);
    window.addEventListener(NEW_PROJECT_EVENT, open);
    return () => window.removeEventListener(NEW_PROJECT_EVENT, open);
  }, []);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(WIDTH_KEY));
    const next =
      Number.isFinite(stored) && stored >= MIN_WIDTH && stored <= MAX_WIDTH
        ? stored
        : proportionalWidth();
    widthRef.current = next;
    setWidth(next);
    setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: MouseEvent) => {
      const left = asideRef.current?.getBoundingClientRect().left ?? 0;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(event.clientX - left)));
      widthRef.current = next;
      setWidth(next);
    };
    const onUp = () => {
      setDragging(false);
      window.localStorage.setItem(WIDTH_KEY, String(widthRef.current));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  const startResize = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    setDragging(true);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const commands = useMemo<Command[]>(() => {
    const navigate = t("palette.groupNavigate");
    const actions = t("palette.groupActions");
    const list: Command[] = NAV.flatMap((section) =>
      section.items.map((item) => ({
        id: `nav:${item.href}`,
        label: t(item.labelKey),
        group: navigate,
        keywords: item.href,
        icon: item.icon,
        run: () => router.push(item.href),
      })),
    );
    list.push(
      {
        id: "action:new-project",
        label: t("palette.newProject"),
        group: actions,
        keywords: "create project new",
        icon: <span className="palette__glyph">+</span>,
        run: () => setWizardOpen(true),
      },
      {
        id: "action:verify",
        label: t("palette.verifyInstall"),
        group: actions,
        keywords: "install live embed verify",
        icon: <IconKey size={17} />,
        run: () => router.push("/embed#verify"),
      },
      {
        id: "action:theme",
        label: t("palette.toggleTheme"),
        group: actions,
        keywords: "dark light theme",
        icon: <IconMoon size={17} />,
        run: toggleTheme,
      },
      {
        id: "action:language",
        label: t("palette.toggleLanguage"),
        group: actions,
        keywords: "language locale english 中文",
        icon: <IconTranslate size={17} />,
        run: () => setLocale(LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length]),
      },
    );
    for (const project of projects) {
      list.push({
        id: `project:${project.id}`,
        label: project.name,
        group: t("palette.groupProjects"),
        hint: project.id === currentId ? t("palette.current") : undefined,
        icon: <span className="palette__glyph">{project.name.slice(0, 1).toUpperCase()}</span>,
        run: () => setCurrentId(project.id),
      });
    }
    return list;
  }, [t, router, projects, currentId, setCurrentId, toggleTheme, setLocale, locale]);

  if (!ready || !user) {
    return (
      <div className="app-loading">
        <LoadingBlock label={t("common.loading")} />
      </div>
    );
  }

  const shellStyle = {
    "--app-sidebar-w": `${collapsed ? 64 : width}px`,
  } as CSSProperties;

  return (
    <div className={dragging ? "app-shell is-dragging" : "app-shell"} style={shellStyle}>
      <aside ref={asideRef} className={collapsed ? "app-sidebar is-collapsed" : "app-sidebar"}>
        <div className="app-sidebar-inner">
          <div className="app-brand">
            <button
              type="button"
              className="app-sidebar-toggle"
              onClick={toggleCollapsed}
              aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
              title={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
            >
              <IconMenu size={18} />
            </button>
            <span className="app-brand-mark">EmbAId</span>
            <span className="app-brand-sub">Agent</span>
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
            <button
              type="button"
              className="app-project-new"
              aria-label={t("project.newProject")}
              title={t("project.newProject")}
              onClick={() => setWizardOpen(true)}
            >
              +
            </button>
          </div>

          <button type="button" className="app-search" onClick={() => setPaletteOpen(true)}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span>{t("palette.trigger")}</span>
            <kbd>⌘K</kbd>
          </button>

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
                      title={t(item.labelKey)}
                    >
                      {item.icon}
                      <span>{t(item.labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <AccountBlock />
        </div>

        <div
          className="app-sidebar-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("nav.resizeSidebar")}
          onMouseDown={startResize}
        />
      </aside>

      <main className="app-main">
        {current ? <OnboardingBar key={current.id} projectId={current.id} /> : null}
        {children}
      </main>

      {/* Keyed on the project so switching projects resets the conversation and
          re-reads that project's deployed key and widget config. */}
      {current ? <DashboardBot key={current.id} projectId={current.id} /> : null}

      <CommandPalette commands={commands} open={paletteOpen} onOpenChange={setPaletteOpen} />

      {wizardOpen && (
        <ProjectWizard onClose={() => setWizardOpen(false)} onCreated={() => router.push("/")} />
      )}
    </div>
  );
}
