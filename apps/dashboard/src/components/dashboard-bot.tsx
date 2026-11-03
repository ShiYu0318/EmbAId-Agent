"use client";

import { IconChat } from "@/components/icons";
import { useChatWidget } from "@/components/live-widget";
import { apiBaseUrl } from "@/lib/api/config";
import { useI18n } from "@/lib/i18n";
import { useProjectKey } from "@/lib/project-key";

/**
 * Floating test bot pinned to the dashboard (spec §6). Once the project is deployed it
 * is the real embeddable widget, talking to the API with the deployed key, so it looks
 * and behaves exactly like it will on the user's site.
 *
 * Until then the launcher stays locked: /v1/chat only accepts X-API-Key, and full keys
 * are visible just once at creation, so the key deployed on /embed is the only one this
 * bot can use.
 */
export function DashboardBot({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const { key } = useProjectKey(projectId, "embed");

  useChatWidget(
    key ? { apiKey: key, projectId, apiUrl: apiBaseUrl(), persist: false } : null,
    () => document.body,
  );

  if (key) return null;
  return (
    <div className="dashboard-bot">
      <button
        type="button"
        className="dashboard-bot__launcher"
        disabled
        aria-label={t("bot.locked")}
        title={t("bot.lockedHint")}
      >
        <IconChat size={22} />
      </button>
    </div>
  );
}
