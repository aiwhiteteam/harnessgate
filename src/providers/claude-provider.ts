/**
 * Claude provider using the Anthropic TypeScript SDK.
 *
 * Uses client.beta.sessions for managed agent session lifecycle,
 * matching the event handling pattern from Votrix.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  Provider,
  CreateSessionOpts,
  ProviderSession,
  ProviderEvent,
  ProviderCapabilities,
  MessagePayload,
  ToolExecutor,
} from "../index.js";
import { createLogger } from "../index.js";

const log = createLogger("provider-claude");

const STREAM_TIMEOUT: Anthropic.RequestOptions["timeout"] = 300_000;

export class ClaudeProvider implements Provider {
  readonly id = "claude";
  readonly capabilities: ProviderCapabilities = {
    interrupt: true,
    toolConfirmation: true,
    customTools: true,
    thinking: true,
  };

  private readonly client: Anthropic;
  private readonly toolExecutor?: ToolExecutor;

  constructor(apiKey: string, opts?: { toolExecutor?: ToolExecutor }) {
    this.client = new Anthropic({ apiKey });
    this.toolExecutor = opts?.toolExecutor;
  }

  // -- Session lifecycle ----------------------------------------------------

  async createSession(opts: CreateSessionOpts): Promise<ProviderSession> {
    const config = opts.providerConfig;
    const agentId = config.agentId as string;
    const environmentId = config.environmentId as string;

    if (!agentId || !environmentId) {
      throw new Error(
        "Claude provider requires agentId and environmentId in provider config",
      );
    }

    const metadata: Record<string, string> = {};
    if (opts.userId) metadata.userId = opts.userId;
    if (opts.sender) {
      metadata.senderPlatformId = opts.sender.id;
      if (opts.sender.username) metadata.senderUsername = opts.sender.username;
      if (opts.sender.displayName)
        metadata.senderDisplayName = opts.sender.displayName;
    }
    if (opts.extra) {
      for (const [k, v] of Object.entries(opts.extra)) {
        metadata[k] = String(v);
      }
    }

    const params: Parameters<typeof this.client.beta.sessions.create>[0] = {
      agent: agentId,
      environment_id: environmentId,
    };
    if (Object.keys(metadata).length > 0) {
      (params as any).metadata = metadata;
    }

    const session = await this.client.beta.sessions.create(params);

    log.info(
      `Session created: ${session.id}${opts.userId ? ` for user ${opts.userId}` : ""}`,
    );
    return { id: session.id, status: "idle", createdAt: Date.now() };
  }

  async destroySession(sessionId: string): Promise<void> {
    try {
      await (this.client.beta.sessions as any).delete(sessionId);
      log.info(`Session deleted: ${sessionId}`);
    } catch (err) {
      log.warn(`Failed to delete session ${sessionId}`, err);
    }
  }

  // -- Messaging ------------------------------------------------------------

  async sendMessage(sessionId: string, message: MessagePayload): Promise<void> {
    const content: Array<{ type: "text"; text: string }> = [
      { type: "text", text: message.text },
    ];

    await (this.client.beta.sessions as any).events.send(sessionId, {
      events: [{ type: "user.message", content }],
    });

    log.debug(`Message sent to session ${sessionId}`);
  }

  async interrupt(sessionId: string): Promise<void> {
    await (this.client.beta.sessions as any).events.send(sessionId, {
      events: [{ type: "user.interrupt" }],
    });
    log.info(`Session interrupted: ${sessionId}`);
  }

  // -- Streaming (core event loop) ------------------------------------------

  async *stream(
    sessionId: string,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    const pendingTools = new Map<string, { name: string; input: unknown }>();
    const sentResults = new Set<string>();
    const mcpToolIds = new Set<string>();

    const eventStream = await (this.client.beta.sessions as any).events.stream(
      sessionId,
      { timeout: STREAM_TIMEOUT },
    );

    try {
      for await (const event of eventStream as AsyncIterable<any>) {
        if (signal.aborted) break;

        log.debug(`[event] ${event.type}`);

        switch (event.type) {
          case "agent.message": {
            for (const block of event.content ?? []) {
              if (block.type === "text" && block.text) {
                yield { type: "message", text: block.text };
              } else if (block.file_id) {
                yield {
                  type: "file",
                  fileId: block.file_id,
                  filename: block.filename ?? block.name,
                  mimeType: block.mime_type ?? block.media_type,
                };
              }
            }
            break;
          }

          case "agent.tool_use": {
            yield {
              type: "tool_use",
              name: event.name ?? "",
              input: event.input ?? {},
            };
            break;
          }

          case "agent.tool_result": {
            yield { type: "tool_result", output: extractTextContent(event.content) };
            break;
          }

          case "agent.mcp_tool_use": {
            mcpToolIds.add(event.id);
            yield {
              type: "tool_use",
              name: event.name ?? "",
              input: event.input ?? {},
            };
            break;
          }

          case "agent.mcp_tool_result": {
            yield { type: "tool_result", output: extractTextContent(event.content) };
            break;
          }

          case "agent.custom_tool_use": {
            pendingTools.set(event.id, {
              name: event.name,
              input: event.input,
            });
            yield {
              type: "custom_tool_request",
              id: event.id,
              name: event.name,
              input: event.input,
            };
            break;
          }

          case "agent.thinking": {
            yield { type: "thinking", text: "" };
            break;
          }

          case "session.status_idle": {
            if (event.stop_reason?.type === "requires_action") {
              const resultEvents = await this.handleRequiresAction(
                sessionId,
                event.stop_reason.event_ids ?? [],
                pendingTools,
                sentResults,
                mcpToolIds,
              );
              for (const evt of resultEvents) yield evt;
              // stream stays open — agent continues
            } else {
              yield { type: "status", status: "idle" };
              return;
            }
            break;
          }

          case "session.error":
          case "error": {
            const error = event.error;
            const msg = error
              ? `${error.type ?? "unknown"}: ${error.message ?? String(error)}`
              : String(event);
            yield { type: "error", message: msg };
            return;
          }

          default:
            log.debug(`[event] unhandled: ${event.type}`);
            break;
        }
      }
    } finally {
      // Ensure stream cleanup
      if (typeof eventStream.controller?.abort === "function") {
        eventStream.controller.abort();
      }
    }
  }

  private async handleRequiresAction(
    sessionId: string,
    eventIds: string[],
    pendingTools: Map<string, { name: string; input: unknown }>,
    sentResults: Set<string>,
    mcpToolIds: Set<string>,
  ): Promise<ProviderEvent[]> {
    const eventsToYield: ProviderEvent[] = [];

    // IDs the agent is waiting on that we never received
    const missedIds = eventIds.filter(
      (id) =>
        !pendingTools.has(id) && !sentResults.has(id) && !mcpToolIds.has(id),
    );

    const toExecute: Array<[string, { name: string; input: unknown }]> = [];
    for (const id of eventIds) {
      const tool = pendingTools.get(id);
      if (tool) {
        pendingTools.delete(id);
        toExecute.push([id, tool]);
      }
    }

    // Send error results for missed tool calls
    if (missedIds.length > 0) {
      const errorEvents = missedIds.map((id) => ({
        type: "user.custom_tool_result" as const,
        custom_tool_use_id: id,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: "Tool call was not received; please retry.",
            }),
          },
        ],
      }));
      try {
        await (this.client.beta.sessions as any).events.send(sessionId, {
          events: errorEvents,
        });
        log.warn(
          `Sent error result for ${missedIds.length} missed tool(s): ${missedIds.join(", ")}`,
        );
      } catch (e) {
        log.warn(`Failed to send missed tool error results`, e);
      }
    }

    if (toExecute.length === 0) return eventsToYield;

    // Execute tools if we have an executor
    if (this.toolExecutor) {
      const toolResults = await Promise.all(
        toExecute.map(async ([id, tool]) => {
          try {
            const result = await this.toolExecutor!(tool.name, tool.input);
            return { id, name: tool.name, result };
          } catch (err) {
            log.error(`Tool execution error [${tool.name}]`, err);
            return {
              id,
              name: tool.name,
              result: { error: String(err) },
            };
          }
        }),
      );

      const results = toolResults.map(({ id, result }) => {
        sentResults.add(id);
        const resultStr =
          typeof result === "string" ? result : JSON.stringify(result);
        eventsToYield.push({ type: "tool_result", output: resultStr });
        return {
          type: "user.custom_tool_result" as const,
          custom_tool_use_id: id,
          content: [{ type: "text" as const, text: resultStr }],
        };
      });

      await (this.client.beta.sessions as any).events.send(sessionId, {
        events: results,
      });
    } else {
      // No executor — send error results so the agent can continue
      const errorResults = toExecute.map(([id, tool]) => {
        sentResults.add(id);
        eventsToYield.push({
          type: "error",
          message: `No tool executor for '${tool.name}'`,
        });
        return {
          type: "user.custom_tool_result" as const,
          custom_tool_use_id: id,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `No tool executor configured for '${tool.name}'`,
              }),
            },
          ],
        };
      });

      await (this.client.beta.sessions as any).events.send(sessionId, {
        events: errorResults,
      });
    }

    return eventsToYield;
  }

  // -- Tool confirmation / results ------------------------------------------

  async confirmTool(
    sessionId: string,
    toolUseId: string,
    approved: boolean,
  ): Promise<void> {
    await (this.client.beta.sessions as any).events.send(sessionId, {
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
    await (this.client.beta.sessions as any).events.send(sessionId, {
      events: [
        {
          type: "user.custom_tool_result",
          custom_tool_use_id: toolUseId,
          content: [{ type: "text", text: String(result) }],
        },
      ],
    });
  }

  // -- Claude-specific methods (not part of the base Provider interface) --

  async defineOutcome(
    sessionId: string,
    outcome: { description: string },
  ): Promise<void> {
    await (this.client.beta.sessions as any).events.send(sessionId, {
      events: [{ type: "user.define_outcome", ...outcome }],
    });
  }

  async archiveSession(sessionId: string): Promise<void> {
    await (this.client.beta.sessions as any).archive(sessionId);
    log.info(`Session archived: ${sessionId}`);
  }
}

function extractTextContent(rawContent: unknown): string {
  if (Array.isArray(rawContent)) {
    return rawContent
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text ?? "")
      .join("\n");
  }
  return String(rawContent ?? "");
}
