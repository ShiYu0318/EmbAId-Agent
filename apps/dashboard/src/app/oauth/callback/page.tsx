"use client";

import { useRouter } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { LoadingBlock } from "@/components/ui";
import { useAuth } from "@/lib/auth/context";
import { parseOAuthFragment } from "@/lib/auth/oauth-callback";
import { useI18n } from "@/lib/i18n";

function CallbackHandler() {
  const { establishSession } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const handoff = parseOAuthFragment(window.location.hash);
    // Drop the tokens from the address bar and history before doing anything else.
    window.history.replaceState(null, "", window.location.pathname);

    if (!handoff) {
      router.replace("/login?oauth_error=missing_tokens");
      return;
    }

    establishSession(handoff.access, handoff.refresh)
      .then(() => router.replace(handoff.next))
      .catch(() => router.replace("/login?oauth_error=session_failed"));
  }, [establishSession, router]);

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
