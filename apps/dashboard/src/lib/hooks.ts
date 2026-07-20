"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, NetworkError } from "@/lib/api/errors";
import type { TranslateFn } from "@/lib/i18n";

export function errorMessage(t: TranslateFn, error: unknown): string {
  if (error instanceof ApiError) {
    const known = new Set([
      "not_found",
      "unauthorized",
      "forbidden",
      "conflict",
      "rate_limited",
      "provider_unavailable",
    ]);
    if (error.message) return error.message;
    if (known.has(error.code)) return t(`errors.${camelize(error.code)}`);
    return t("errors.generic");
  }
  if (error instanceof NetworkError) return t("errors.network");
  if (error instanceof Error && error.message) return error.message;
  return t("errors.generic");
}

function camelize(value: string): string {
  return value.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: unknown;
}

export function useAsyncData<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: ReadonlyArray<unknown>,
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState((prev) => ({ data: prev.data, loading: true, error: null }));

    loaderRef
      .current(controller.signal)
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || !active) return;
        setState({ data: null, loading: false, error });
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

export function useCopy(resetMs = 1800): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(
    (text: string) => {
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), resetMs);
      });
    },
    [resetMs],
  );
  return [copied, copy];
}
