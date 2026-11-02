"use client";

import { useEffect } from "react";

import { useAuth } from "@/lib/auth/context";
import { useAsyncData, usePoll } from "@/lib/hooks";

/** Fired when something the deploy checklist depends on has changed. */
export const LAUNCH_CHANGED_EVENT = "embaid:launch-changed";

export interface LaunchStatus {
  hasDocuments: boolean;
  indexed: boolean;
  tested: boolean;
  customized: boolean;
  hasKey: boolean;
  hasOrigins: boolean;
  /** A conversation arrived from a real website, not the dashboard or a sandbox key. */
  live: boolean;
  liveAt: string | null;
}

/** Everything the deploy checklist needs, read from real project state. */
export function useLaunchStatus(projectId: string, pollMs?: number) {
  const { api } = useAuth();

  const state = useAsyncData<LaunchStatus>(async () => {
    const [documents, ready, config, keys, website, dashboard, sandbox] = await Promise.all([
      api.documents.list(projectId, { limit: 1 }),
      api.documents.list(projectId, { status: "ready", limit: 1 }),
      api.projects.getWidgetConfig(projectId),
      api.apiKeys.list(projectId),
      api.conversations.list({ project_id: projectId, channel: "widget", is_sandbox: false, limit: 1 }),
      api.conversations.list({ project_id: projectId, channel: "dashboard", limit: 1 }),
      api.conversations.list({ project_id: projectId, is_sandbox: true, limit: 1 }),
    ]);
    const publishable = keys.filter((k) => k.type === "publishable" && !k.revoked_at);
    return {
      hasDocuments: documents.length > 0,
      indexed: ready.length > 0,
      tested: dashboard.total > 0 || sandbox.total > 0,
      customized: Boolean(config.greeting || config.bot_name || config.suggested_questions.length),
      hasKey: publishable.length > 0,
      hasOrigins: publishable.some((k) => k.allowed_origins.length > 0),
      live: website.total > 0,
      liveAt: website.items[0]?.started_at ?? null,
    };
  }, [projectId]);

  usePoll(Boolean(pollMs) && !state.data?.live, state.reload, pollMs);

  const { reload } = state;
  useEffect(() => {
    window.addEventListener(LAUNCH_CHANGED_EVENT, reload);
    return () => window.removeEventListener(LAUNCH_CHANGED_EVENT, reload);
  }, [reload]);

  return state;
}
