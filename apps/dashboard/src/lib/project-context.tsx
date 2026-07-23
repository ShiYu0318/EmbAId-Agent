"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth/context";
import type { Project, ProjectCreateBody } from "@/lib/api/types";

const STORAGE_KEY = "proprai.project";

interface ProjectContextValue {
  projects: Project[];
  current: Project | null;
  currentId: string | null;
  loading: boolean;
  error: unknown;
  setCurrentId: (id: string) => void;
  reload: () => Promise<void>;
  create: (body: ProjectCreateBody) => Promise<Project>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { api, user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.projects.list();
      setProjects(list);
      setCurrentIdState((prev) => {
        const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
        const candidate = prev ?? stored;
        if (candidate && list.some((p) => p.id === candidate)) return candidate;
        return list[0]?.id ?? null;
      });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (user) {
      void load();
    }
  }, [user, load]);

  const setCurrentId = useCallback((id: string) => {
    setCurrentIdState(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const create = useCallback(
    async (body: ProjectCreateBody) => {
      const project = await api.projects.create(body);
      await load();
      setCurrentId(project.id);
      return project;
    },
    [api, load, setCurrentId],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      await api.projects.update(id, { name });
      await load();
    },
    [api, load],
  );

  const remove = useCallback(
    async (id: string) => {
      await api.projects.remove(id);
      if (currentId === id) {
        setCurrentIdState(null);
        window.localStorage.removeItem(STORAGE_KEY);
      }
      await load();
    },
    [api, load, currentId],
  );

  const current = useMemo(
    () => projects.find((p) => p.id === currentId) ?? null,
    [projects, currentId],
  );

  const value = useMemo<ProjectContextValue>(
    () => ({ projects, current, currentId, loading, error, setCurrentId, reload: load, create, rename, remove }),
    [projects, current, currentId, loading, error, setCurrentId, load, create, rename, remove],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjects(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProjects must be used within a ProjectProvider");
  }
  return context;
}
