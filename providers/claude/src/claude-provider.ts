import type {
  Provider,
  CreateSessionOpts,
  ProviderSession,
  ProviderEvent,
  MessagePayload,
} from "@harnessgate/core";
import { createLogger } from "@harnessgate/core";
import type {
  ClaudeAgentMessageEvent,
  ClaudeAgentThinkingEvent,
  ClaudeAgentToolUseEvent,
  ClaudeAgentCustomToolUseEvent,
  ClaudeSessionStatusIdleEvent,
  ClaudeSessionErrorEvent,
} from "./types.js";

const log = createLogger("provider-claude");

const BASE_URL = "https://api.anthropic.com/v1";
const API_VERSION = "2023-06-01";
const BETA_HEADER = "managed-agents-2026-04-01";

export class ClaudeProvider implements Provider {
  readonly id = "claude";
  readonly capabilities = {
    interrupt: true,
    toolConfirmation: true,
    customTools: true,
    thinking: true,
  };
  private readonly _headers: Record<string, string>;

  constructor(apiKey: string) {
    this._headers = {
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      "anthropic-beta": BETA_HEADER,
      "content-type": "application/json",
    };
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
      method,
      headers: this._headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Claude API ${method} ${path} failed (${res.status}): ${text}`);
    }
    return res;
  }

  async createSession(opts: CreateSessionOpts): Promise<ProviderSession> {
    const config = opts.providerConfig;
    const agentId = config.agentId as string;
    const environmentId = config.environmentId as string;

    if (!agentId || !environmentId) {
      throw new Error("Claude provider requires agentId and environmentId in provider config");
    }

    // Build session metadata with user identity
    const metadata: Record<string, string> = {};
    if (opts.userId) {
      metadata.userId = opts.userId;
    }
    if (opts.sender) {
      metadata.senderPlatformId = opts.sender.id;
      if (opts.sender.username) metadata.senderUsername = opts.sender.username;
      if (opts.sender.displayName) metadata.senderDisplayName = opts.sender.displayName;
    }
    if (opts.extra) {
      for (const [k, v] of Object.entries(opts.extra)) {
        metadata[k] = String(v);
      }
    }

    const body: Record<string, unknown> = {
      agent: agentId,
      environment_id: environmentId,
    };
    if (Object.keys(metadata).length > 0) {
      body.metadata = metadata;
    }

    const res = await this.request("POST", "/sessions", body);
    const data = (await res.json()) as { id: string; status: string };

    log.info(`Session created: ${data.id}${opts.userId ? ` for user ${opts.userId}` : ""}`);
    return {
      id: data.id,
      status: "idle",
      createdAt: Date.now(),
    };
  }

  async sendMessage(sessionId: string, message: MessagePayload): Promise<void> {
    const content: Array<{ type: "text"; text: string }> = [
      { type: "text", text: message.text },
    ];

    await this.request("POST", `/sessions/${sessionId}/events`, {
      events: [
        {
          type: "user.message",
          content,
        },
      ],
    });

    log.debug(`Message sent to session ${sessionId}`);
  }

  async interrupt(sessionId: string): Promise<void> {
    await this.request("POST", `/sessions/${sessionId}/events`, {
      events: [{ type: "user.interrupt" }],
    });
    log.info(`Session interrupted: ${sessionId}`);
  }

  async *stream(
    sessionId: string,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    const url = `${BASE_URL}/sessions/${sessionId}/stream?beta=true`;
    const res = await fetch(url, {
      headers: {
        ...this._headers,
        Accept: "text/event-stream",
      },
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
          // Empty line = SSE event boundary
          const json = dataLines.join("\n").trim();
          dataLines = [];
          if (!json || json === "[DONE]") continue;

          try {
            const event = JSON.parse(json) as { type: string };
            const mapped = this.translateEvent(event);
            if (mapped) yield mapped;
          } catch {
            log.warn(`Failed to parse SSE event: ${json.slice(0, 100)}`);
          }
        }
      }
    }
  }

  async confirmTool(
    sessionId: string,
    toolUseId: string,
    approved: boolean,
  ): Promise<void> {
    await this.request("POST", `/sessions/${sessionId}/events`, {
      events: [
        {
          type: "user.tool_confirmation",
          tool_use_id: toolUseId,
          result: approved ? "allow" : "deny",
        },
      ],
    });
  }

  async submitToolResult(
    sessionId: string,
    toolUseId: string,
    result: unknown,
  ): Promise<void> {
    await this.request("POST", `/sessions/${sessionId}/events`, {
      events: [
        {
          type: "user.custom_tool_result",
          custom_tool_use_id: toolUseId,
          content: [{ type: "text", text: String(result) }],
        },
      ],
    });
  }

  async destroySession(sessionId: string): Promise<void> {
    try {
      await this.request("DELETE", `/sessions/${sessionId}`);
      log.info(`Session deleted: ${sessionId}`);
    } catch (err) {
      log.warn(`Failed to delete session ${sessionId}`, err);
    }
  }

  private translateEvent(raw: { type: string }): ProviderEvent | null {
    switch (raw.type) {
      case "agent.message": {
        const event = raw as ClaudeAgentMessageEvent;
        const text = event.content
          .filter((b): b is { type: string; text: string } => b.type === "text" && typeof b.text === "string")
          .map((b) => b.text)
          .join("");
        if (!text) return null;
        return { type: "message", text };
      }

      case "agent.thinking": {
        const event = raw as ClaudeAgentThinkingEvent;
        const thinking = event.content
          .map((b) => b.thinking ?? "")
          .join("");
        if (!thinking) return null;
        return { type: "thinking", text: thinking };
      }

      case "agent.tool_use": {
        const event = raw as ClaudeAgentToolUseEvent;
        return { type: "tool_use", name: event.name, input: event.input };
      }

      case "agent.custom_tool_use": {
        const event = raw as ClaudeAgentCustomToolUseEvent;
        return {
          type: "custom_tool_request",
          id: event.id,
          name: event.name,
          input: event.input,
        };
      }

      case "session.status_running":
        return { type: "status", status: "running" };

      case "session.status_idle": {
        const event = raw as ClaudeSessionStatusIdleEvent;
        return {
          type: "status",
          status: "idle",
          stopReason: event.stop_reason?.type,
        };
      }

      case "session.error": {
        const event = raw as ClaudeSessionErrorEvent;
        return {
          type: "error",
          message: event.error?.message ?? "Unknown error",
        };
      }

      case "session.status_terminated":
        return { type: "status", status: "error" };

      default:
        // Forward unrecognized Claude events as raw events
        // (multi-agent threads, outcomes, spans, etc.)
        return { type: "raw", eventType: raw.type, data: raw };
    }
  }

  // -- Claude-specific methods (not part of the base Provider interface) --

  /** Define an outcome for the agent to work toward. Claude-specific. */
  async defineOutcome(
    sessionId: string,
    outcome: { description: string },
  ): Promise<void> {
    await this.request("POST", `/sessions/${sessionId}/events`, {
      events: [
        {
          type: "user.define_outcome",
          ...outcome,
        },
      ],
    });
  }

  /** Archive a session (prevents new events, preserves history). Claude-specific. */
  async archiveSession(sessionId: string): Promise<void> {
    await this.request("POST", `/sessions/${sessionId}/archive`);
    log.info(`Session archived: ${sessionId}`);
  }
}
