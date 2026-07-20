"use client";

import { useCallback, useEffect, useState } from "react";

function storageKey(projectId: string): string {
  return `proprai.key.${projectId}`;
}

export function useProjectKey(projectId: string | null): {
  key: string | null;
  setKey: (value: string) => void;
  clearKey: () => void;
} {
  const [key, setKeyState] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setKeyState(null);
      return;
    }
    setKeyState(window.localStorage.getItem(storageKey(projectId)));
  }, [projectId]);

  const setKey = useCallback(
    (value: string) => {
      if (!projectId) return;
      const trimmed = value.trim();
      window.localStorage.setItem(storageKey(projectId), trimmed);
      setKeyState(trimmed);
    },
    [projectId],
  );

  const clearKey = useCallback(() => {
    if (!projectId) return;
    window.localStorage.removeItem(storageKey(projectId));
    setKeyState(null);
  }, [projectId]);

  return { key, setKey, clearKey };
}
