export interface OAuthHandoff {
  access: string;
  refresh: string;
  next: string;
}

/** Only same-site relative paths are followed after sign-in. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

/**
 * The API returns tokens in the URL fragment so they never reach a server log
 * or a Referer header.
 */
export function parseOAuthFragment(hash: string): OAuthHandoff | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const access = params.get("access_token");
  const refresh = params.get("refresh_token");
  if (!access || !refresh) return null;
  return { access, refresh, next: safeNextPath(params.get("next")) };
}
