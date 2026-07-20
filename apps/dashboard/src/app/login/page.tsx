"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/context";
import { useI18n } from "@/lib/i18n";
import { Button, Field, Input, InlineError } from "@/components/ui";

type Mode = "login" | "signup";

export default function LoginPage() {
  const { t } = useI18n();
  const { ready, user, login, signup } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace("/");
  }, [ready, user, router]);

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
    <main className="auth-shell">
      <section className="auth-card">
        <h1>{isLogin ? t("auth.loginTitle") : t("auth.signupTitle")}</h1>
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
