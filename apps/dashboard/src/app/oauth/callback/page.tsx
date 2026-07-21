"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { LoadingBlock } from "@/components/ui";
import { useAuth } from "@/lib/auth/context";
import { useI18n } from "@/lib/i18n";

function CallbackHandler() {
  const { establishSession } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const access = params.get("access_token");
    const refresh = params.get("refresh_token");
    const next = params.get("next") || "/";

    if (!access || !refresh) {
      router.replace("/login?oauth_error=missing_tokens");
      return;
    }

    establishSession(access, refresh)
      .then(() => router.replace(next))
      .catch((err: unknown) => {
        const detail = err instanceof Error ? err.message : String(err);
        router.replace(`/login?oauth_error=session_failed&detail=${encodeURIComponent(detail)}`);
      });
  }, [params, establishSession, router]);

  return (
    <main className="auth-shell">
      <LoadingBlock label={t("auth.completingSignIn")} />
    </main>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackHandler />
    </Suspense>
  );
}
