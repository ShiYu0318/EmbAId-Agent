"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { ApiError } from "@/lib/api/errors";
import { apiBaseUrl } from "@/lib/api/config";
import { useAuth } from "@/lib/auth/context";
import { useI18n } from "@/lib/i18n";
import { Button, Field, Input, InlineError } from "@/components/ui";

type Mode = "login" | "signup";

function LoginForm() {
  const { t } = useI18n();
  const { ready, user, login, signup } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace("/");
  }, [ready, user, router]);

  useEffect(() => {
    if (params.get("oauth_error")) setError(t("auth.oauthError"));
  }, [params, t]);

  useEffect(() => {
    let active = true;
    fetch(`${apiBaseUrl()}/auth/providers`)
      .then((res) => (res.ok ? res.json() : { google: false }))
      .then((data: { google?: boolean }) => {
        if (active) setGoogleEnabled(Boolean(data.google));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  function messageFor(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 401) return t("auth.invalidCredentials");
      if (err.status === 409) return t("auth.emailTaken");
    }
    return t("auth.genericError");
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login({ email, password });
      } else {
        await signup({
          email,
          password,
          display_name: displayName || undefined,
          organization_name: organizationName || undefined,
        });
      }
      router.replace("/");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <main className="auth-split">
      <aside className="auth-aside" aria-hidden="true">
        <span className="auth-aside__eyebrow">
          {t("common.appName")} <span>· {t("auth.asideTag")}</span>
        </span>
        <div className="auth-aside__lead">
          <h2 className="auth-aside__title">{t("auth.asideTitle")}</h2>
          <p className="auth-aside__text">{t("auth.asideSubtitle")}</p>
        </div>
        <div className="auth-demo">
          <div className="auth-demo__head">
            <span className="auth-demo__avatar">智</span>
            <span className="auth-demo__name">{t("auth.demoLabel")}</span>
          </div>
          <div className="auth-demo__bubble auth-demo__bubble--user">
            {t("auth.demoQuestion")}
          </div>
          <div className="auth-demo__bubble auth-demo__bubble--bot">
            {t("auth.demoAnswer")}
          </div>
          <div className="auth-demo__source">{t("auth.demoSource")}</div>
        </div>
      </aside>

      <section className="auth-panel">
        <div className="auth-brand">
          <span className="auth-brand__mark">P</span>
          <span className="auth-brand__name">{t("common.appName")}</span>
        </div>

        <h1 className="auth-panel__title">
          {isLogin ? t("auth.loginTitle") : t("auth.signupTitle")}
        </h1>
        <p className="auth-subtitle">
          {isLogin ? t("auth.loginSubtitle") : t("auth.signupSubtitle")}
        </p>

        <form onSubmit={onSubmit}>
          <Field label={t("auth.email")}>
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label={t("auth.password")} hint={isLogin ? undefined : t("auth.passwordHint")}>
            <Input
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={isLogin ? undefined : 10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {!isLogin && (
            <>
              <Field label={t("auth.displayName")}>
                <Input
                  value={displayName}
                  placeholder={t("auth.displayNamePlaceholder")}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </Field>
              <Field label={t("auth.organizationName")}>
                <Input
                  value={organizationName}
                  placeholder={t("auth.organizationPlaceholder")}
                  onChange={(e) => setOrganizationName(e.target.value)}
                />
              </Field>
            </>
          )}

          {error && <InlineError>{error}</InlineError>}

          <Button type="submit" variant="primary" fullWidth loading={busy}>
            {isLogin ? t("auth.loginCta") : t("auth.signupCta")}
          </Button>
        </form>

        {googleEnabled && (
          <>
            <div className="auth-divider">
              <span>{t("auth.orDivider")}</span>
            </div>
            <a className="auth-google" href={`${apiBaseUrl()}/auth/oauth/google`}>
              <GoogleMark />
              {t("auth.continueWithGoogle")}
            </a>
          </>
        )}

        <p className="auth-switch">
          {isLogin ? t("auth.toSignupPrompt") : t("auth.toLoginPrompt")}{" "}
          <button
            type="button"
            className="auth-link"
            onClick={() => {
              setMode(isLogin ? "signup" : "login");
              setError(null);
            }}
          >
            {isLogin ? t("auth.toSignupLink") : t("auth.toLoginLink")}
          </button>
        </p>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.42 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
