import type { AuthUser } from "./types";

export interface TokenStore {
  getAccess(): string | null;
  getRefresh(): string | null;
  getUser(): AuthUser | null;
  setSession(access: string, refresh: string, user: AuthUser): void;
  setTokens(access: string, refresh: string): void;
  clear(): void;
}

const ACCESS_KEY = "embaid.access";
const REFRESH_KEY = "embaid.refresh";
const USER_KEY = "embaid.user";

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function createBrowserTokenStore(): TokenStore {
  return {
    getAccess() {
      return hasWindow() ? window.localStorage.getItem(ACCESS_KEY) : null;
    },
    getRefresh() {
      return hasWindow() ? window.localStorage.getItem(REFRESH_KEY) : null;
    },
    getUser() {
      if (!hasWindow()) return null;
      const raw = window.localStorage.getItem(USER_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as AuthUser;
      } catch {
        return null;
      }
    },
    setSession(access, refresh, user) {
      if (!hasWindow()) return;
      window.localStorage.setItem(ACCESS_KEY, access);
      window.localStorage.setItem(REFRESH_KEY, refresh);
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    },
    setTokens(access, refresh) {
      if (!hasWindow()) return;
      window.localStorage.setItem(ACCESS_KEY, access);
      window.localStorage.setItem(REFRESH_KEY, refresh);
    },
    clear() {
      if (!hasWindow()) return;
      window.localStorage.removeItem(ACCESS_KEY);
      window.localStorage.removeItem(REFRESH_KEY);
      window.localStorage.removeItem(USER_KEY);
    },
  };
}

export function createMemoryTokenStore(seed?: Partial<{ access: string; refresh: string; user: AuthUser }>): TokenStore {
  let access = seed?.access ?? null;
  let refresh = seed?.refresh ?? null;
  let user = seed?.user ?? null;
  return {
    getAccess: () => access,
    getRefresh: () => refresh,
    getUser: () => user,
    setSession(a, r, u) {
      access = a;
      refresh = r;
      user = u;
    },
    setTokens(a, r) {
      access = a;
      refresh = r;
    },
    clear() {
      access = null;
      refresh = null;
      user = null;
    },
  };
}
