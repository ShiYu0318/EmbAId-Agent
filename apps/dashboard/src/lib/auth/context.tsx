"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ApiClient } from "@/lib/api/client";
import { apiBaseUrl } from "@/lib/api/config";
import { createApi, type Api } from "@/lib/api/resources";
import { createBrowserTokenStore, type TokenStore } from "@/lib/api/tokens";
import type { AuthUser, LoginBody, SignupBody } from "@/lib/api/types";

interface AuthContextValue {
  ready: boolean;
  user: AuthUser | null;
  api: Api;
  login: (body: LoginBody) => Promise<void>;
  signup: (body: SignupBody) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const storeRef = useRef<TokenStore | null>(null);

  if (storeRef.current === null) {
    storeRef.current = createBrowserTokenStore();
  }
  const store = storeRef.current;

  const client = useMemo(
    () =>
      new ApiClient({
        baseUrl: apiBaseUrl(),
        tokens: store,
        onAuthCleared: () => setUser(null),
      }),
    [store],
  );

  const api = useMemo(() => createApi(client), [client]);

  useEffect(() => {
    setUser(store.getUser());
    setReady(true);
  }, [store]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      api,
      async login(body) {
        const result = await api.auth.login(body);
        store.setSession(result.access_token, result.refresh_token, result.user);
        setUser(result.user);
      },
      async signup(body) {
        const result = await api.auth.signup(body);
        store.setSession(result.access_token, result.refresh_token, result.user);
        setUser(result.user);
      },
      logout() {
        store.clear();
        setUser(null);
      },
    }),
    [ready, user, api, store],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
