"use client";

import Link from "next/link";
import { useEffect } from "react";

import { IconArrowRight, IconCheck } from "@/components/icons";
import { Card } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { LAUNCH_CHANGED_EVENT, useLaunchStatus } from "@/lib/launch";

const POLL_MS = 4000;

/** Waits for the first conversation that comes from a real website, then confirms the install. */
export function InstallVerifier({ projectId }: { projectId: string }) {
  const { t, locale } = useI18n();
  const { data } = useLaunchStatus(projectId, POLL_MS);

  const live = data?.live ?? false;
  useEffect(() => {
    if (live) window.dispatchEvent(new Event(LAUNCH_CHANGED_EVENT));
  }, [live]);
  const checks = [
    { label: t("verify.checkKey"), ok: data?.hasKey ?? false },
    { label: t("verify.checkOrigins"), ok: data?.hasOrigins ?? false },
    { label: t("verify.checkTraffic"), ok: live },
  ];

  return (
    <Card className={live ? "verify is-live" : "verify"}>
      <div id="verify" className="verify__inner" aria-live="polite">
        <span className="verify__orb" aria-hidden>
          {live ? <IconCheck size={20} /> : <i />}
        </span>
        <div className="verify__copy">
          <h2 className="verify__title">{live ? t("verify.liveTitle") : t("verify.waitingTitle")}</h2>
          <p className="verify__text">
            {live && data?.liveAt
              ? t("verify.liveText").replace("{time}", formatDateTime(data.liveAt, locale))
              : t("verify.waitingText")}
          </p>
          <ul className="verify__checks">
            {checks.map((check) => (
              <li key={check.label} className={check.ok ? "is-ok" : undefined}>
                <span aria-hidden>{check.ok ? <IconCheck size={12} /> : null}</span>
                {check.label}
              </li>
            ))}
          </ul>
        </div>
        {live ? (
          <Link href="/conversations" className="verify__link">
            {t("verify.viewConversations")}
            <IconArrowRight size={14} />
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
