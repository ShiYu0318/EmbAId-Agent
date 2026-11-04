import { EmbAIdError, EmbAIdPermissionError } from "./errors";
import { HttpClient } from "./http";
import { ChatResource } from "./resources/chat";
import { ManagementResources } from "./resources/management";
import type { KeyType } from "./types/common";

export interface EmbAIdOptions {
  apiKey: string;
  projectId: string;
  baseUrl?: string;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  maxRetries?: number;
  timeout?: number;
}

// Self-hosted only: there is no shared hosted API, so local development is the default.
const DEFAULT_BASE_URL = "http://localhost:8000";

const PREFIXES: Record<string, KeyType> = {
  pub_: "publishable",
  sk_: "secret",
  sbx_: "sandbox",
};

function detectKeyType(apiKey: string): KeyType {
  for (const [prefix, type] of Object.entries(PREFIXES)) {
    if (apiKey.startsWith(prefix)) return type;
  }
  throw new EmbAIdError("api key must start with pub_, sk_, or sbx_", {
    status: 0,
    code: "invalid_request",
  });
}

export class EmbAId {
  readonly keyType: KeyType;
  readonly chat: ChatResource;

  private readonly http: HttpClient;
  private readonly management: ManagementResources;

  constructor(options: EmbAIdOptions) {
    if (!options.apiKey) throw new EmbAIdError("apiKey is required", { status: 0 });
    if (!options.projectId) throw new EmbAIdError("projectId is required", { status: 0 });

    this.keyType = detectKeyType(options.apiKey);
    this.http = new HttpClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      fetch: options.fetch,
      maxRetries: options.maxRetries,
      timeout: options.timeout,
    });
    this.chat = new ChatResource(this.http);
    this.management = new ManagementResources(this.http, options.projectId);
  }

  private requireSecret<T>(resource: string, group: T): T {
    if (this.keyType !== "secret") {
      throw new EmbAIdPermissionError({ keyType: this.keyType, resource, requiredKeyType: "secret" });
    }
    return group;
  }

  get projects() {
    return this.requireSecret("projects", this.management.projects);
  }

  get apiKeys() {
    return this.requireSecret("apiKeys", this.management.apiKeys);
  }

  get sources() {
    return this.requireSecret("sources", this.management.sources);
  }

  get documents() {
    return this.requireSecret("documents", this.management.documents);
  }

  get tags() {
    return this.requireSecret("tags", this.management.tags);
  }

  get knowledgeGaps() {
    return this.requireSecret("knowledgeGaps", this.management.knowledgeGaps);
  }

  get analytics() {
    return this.requireSecret("analytics", this.management.analytics);
  }

  get webhooks() {
    return this.requireSecret("webhooks", this.management.webhooks);
  }
}
