import type {
  Provider,
  ProviderCapabilities,
  CreateSessionOpts,
  ProviderSession,
  ProviderEvent,
  MessagePayload,
} from "../index.js";
import { createLogger } from "../index.js";

const log = createLogger("provider-http");

export interface HttpProviderEndpoints {
  createSession: string;
  sendMessage: string;
  stream: string;
  destroySession: string;
}

const DEFAULT_ENDPOINTS: HttpProviderEndpoints = {
  createSession: "POST /sessions",
  sendMessage: "POST /sessions/{sessionId}/message",
  stream: "GET /sessions/{sessionId}/stream",
  destroySession: "DELETE /sessions/{sessionId}",
};

function parseEndpoint(spec: string): { method: string; path: string } {
  const spaceIdx = spec.indexOf(" ");
  if (spaceIdx === -1) return { method: "GET", path: spec };
  return {
    method: spec.slice(0, spaceIdx).toUpperCase(),
    path: spec.slice(spaceIdx + 1),
  };
}

function resolvePath(pathTemplate: string, vars: Record<string, string>): string {
  return pathTemplate.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

export class HttpProvider implements Provider {
  readonly id = "http";
  readonly capabilities: ProviderCapabilities = {
    interrupt: false,
    toolConfirmation: false,
    customTools: false,
    thinking: false,
  };

  private baseUrl: string;
  private headers: Record<string, string>;
  private endpoints: HttpProviderEndpoints;

  constructor(config: Record<string, unknown>) {
    this.baseUrl = (config.baseUrl as string) ?? "";
    if (!this.baseUrl) {
      throw new Error("HTTP provider requires baseUrl in provider config");
    }
    // Remove trailing slash
    this.baseUrl = this.baseUrl.replace(/\/+$/, "");

    // Custom headers (auth, etc.)
    this.headers = {
      "content-type": "application/json",
      ...((config.headers as Record<string, string>) ?? {}),
    };

    // Custom endpoint paths
    const configEndpoints = (config.endpoints as Partial<HttpProviderEndpoints>) ?? {};
    this.endpoints = { ...DEFAULT_ENDPOINTS, ...configEndpoints };

    log.info(`HTTP provider configured: ${this.baseUrl}`);
  }

  private async request(
    endpointSpec: string,
    vars: Record<string, string>,
    body?: unknown,
  ): Promise<Response> {
    const { method, path } = parseEndpoint(endpointSpec);
    const resolvedPath = resolvePath(path, vars);
    const url = `${this.baseUrl}${resolvedPath}`;

    const res = await fetch(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP provider ${method} ${resolvedPath} failed (${res.status}): ${text}`);
    }

    return res;
  }

  async createSession(opts: CreateSessionOpts): Promise<ProviderSession> {
    const res = await this.request(this.endpoints.createSession, {}, {
      systemPrompt: opts.systemPrompt,
      ...opts.extra,
    });

    const data = (await res.json()) as { id?: string; sessionId?: string };
    const id = data.id ?? data.sessionId;
    if (!id) {
      throw new Error("HTTP provider: createSession response must include 'id' or 'sessionId'");
    }

    log.info(`Session created: ${id}`);
    return { id, status: "idle", createdAt: Date.now() };
  }

  async sendMessage(sessionId: string, message: MessagePayload): Promise<void> {
    await this.request(
      this.endpoints.sendMessage,
      { sessionId },
      { message: message.text, sessionId },
    );
    log.debug(`Message sent to session ${sessionId}`);
  }

  async *stream(
    sessionId: string,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    const { method, path } = parseEndpoint(this.endpoints.stream);
    const resolvedPath = resolvePath(path, { sessionId });
    const url = `${this.baseUrl}${resolvedPath}`;

    const res = await fetch(url, {
      method,
      headers: { ...this.headers, Accept: "text/event-stream" },
      signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Stream open failed (${res.status}): ${text}`);
    }

    const body = res.body;
    if (!body) throw new Error("No response body for SSE stream");

    const decoder = new TextDecoder();
    let buffer = "";
    let dataLines: string[] = [];

    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      if (signal.aborted) break;

      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          dataLines.push(line.slice(6));
        } else if (line === "" && dataLines.length > 0) {
          const json = dataLines.join("\n").trim();
          dataLines = [];
          if (!json || json === "[DONE]") continue;

          try {
            const event = JSON.parse(json) as Record<string, unknown>;
            const mapped = this.translateEvent(event);
            if (mapped) yield mapped;
          } catch {
            log.warn(`Failed to parse SSE event: ${json.slice(0, 100)}`);
          }
        }
      }
    }
  }

  async destroySession(sessionId: string): Promise<void> {
    try {
      await this.request(this.endpoints.destroySession, { sessionId });
      log.info(`Session destroyed: ${sessionId}`);
    } catch (err) {
      log.warn(`Failed to destroy session ${sessionId}`, err);
    }
  }

  /**
   * Translates SSE events from the custom server.
   *
   * The server can emit events in two formats:
   *
   * 1. HarnessGate-native format (recommended):
   *    data: {"type": "message", "text": "Hello"}
   *    data: {"type": "status", "status": "idle"}
   *    data: {"type": "error", "message": "Something failed"}
   *
   * 2. Simple format (for basic chat APIs):
   *    data: {"response": "Hello"}
   *    data: {"text": "Hello"}
   *    data: {"content": "Hello"}
   *    → Auto-mapped to { type: "message", text: "..." }
   */
  private translateEvent(raw: Record<string, unknown>): ProviderEvent | null {
    // If the event already has a recognized type, pass it through
    if (typeof raw.type === "string") {
      switch (raw.type) {
        case "message":
          return { type: "message", text: String(raw.text ?? "") };
        case "thinking":
          return { type: "thinking", text: String(raw.text ?? "") };
        case "status":
          return {
            type: "status",
            status: raw.status as "running" | "idle" | "error",
            stopReason: raw.stopReason as string | undefined,
          };
        case "error":
          return { type: "error", message: String(raw.message ?? "Unknown error") };
        case "tool_use":
          return { type: "tool_use", name: String(raw.name), input: raw.input };
        case "tool_result":
          return { type: "tool_result", output: String(raw.output ?? "") };
        default:
          return { type: "raw", eventType: String(raw.type), data: raw };
      }
    }

    // Simple format: extract text from common field names
    const text = raw.response ?? raw.text ?? raw.content ?? raw.message;
    if (typeof text === "string" && text) {
      return { type: "message", text };
    }

    // Unrecognized shape
    return { type: "raw", eventType: "unknown", data: raw };
  }
}
