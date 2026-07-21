import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "@/lib/api/client";
import { createMemoryTokenStore } from "@/lib/api/tokens";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ApiClient", () => {
  it("invokes the native fetch without an illegal receiver", async () => {
    const nativeFetch = vi.fn(function (this: unknown) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });

    const client = new ApiClient({
      baseUrl: "http://localhost:8001",
      tokens: createMemoryTokenStore({ access: "token" }),
      fetchImpl: nativeFetch as unknown as typeof fetch,
    });

    await expect(client.get("/auth/me")).resolves.toEqual({ ok: true });
    expect(nativeFetch).toHaveBeenCalledOnce();
  });

  it("sends the bearer token from the store", async () => {
    let sentAuth: string | null = null;
    const fetchImpl = vi.fn((_: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      sentAuth = headers.get("Authorization");
      return Promise.resolve(jsonResponse({ id: "user_1" }));
    });

    const client = new ApiClient({
      baseUrl: "http://localhost:8001",
      tokens: createMemoryTokenStore({ access: "abc123" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.get("/auth/me");
    expect(sentAuth).toBe("Bearer abc123");
  });
});
