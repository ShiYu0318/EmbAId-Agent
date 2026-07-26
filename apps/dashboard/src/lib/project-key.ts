"use client";

import { useCallback, useEffect, useState } from "react";

// Where a stored key came from. The playground holds whatever key the user pasted
// to test with (often a secret one); the embed scope holds the publishable key the
// user deployed, which is what unlocks the dashboard's floating bot.
export type KeyScope = "playground" | "embed";

function storageKey(projectId: string, scope: KeyScope): string {
  // The playground slot predates scoping — keep its name so existing keys survive.
  return scope === "playground" ? `proprai.key.${projectId}` : `proprai.${scope}.${projectId}`;
}

export function useProjectKey(
  projectId: string | null,
  scope: KeyScope = "playground",
): {
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
    setKeyState(window.localStorage.getItem(storageKey(projectId, scope)));
  }, [projectId, scope]);

  const setKey = useCallback(
    (value: string) => {
      if (!projectId) return;
      const trimmed = value.trim();
      window.localStorage.setItem(storageKey(projectId, scope), trimmed);
      setKeyState(trimmed);
    },
    [projectId, scope],
  );

  const clearKey = useCallback(() => {
    if (!projectId) return;
    window.localStorage.removeItem(storageKey(projectId, scope));
    setKeyState(null);
  }, [projectId, scope]);

  return { key, setKey, clearKey };
}
