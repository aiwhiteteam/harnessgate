import type { MessagePayload, Sender, InboundMessage } from "./messages.js";

export type SessionStatus = "idle" | "running" | "rescheduling" | "terminated";

export interface ProviderSession {
  id: string;
  status: SessionStatus;
  createdAt: number;
}

/**
 * Provider-specific session creation options.
 * Each provider interprets providerConfig for its own needs.
 */
export interface CreateSessionOpts {
  /** Provider-specific config (agentId, environmentId, baseUrl, etc.). */
  providerConfig: Record<string, unknown>;
  /** The user who initiated this session. */
  sender: Sender;
  /** Resolved internal user ID (from UserResolver). */
  userId?: string;
  /** Optional system prompt override for this session. */
  systemPrompt?: string;
  /** Optional provider-specific session options (vault_ids, agent version, etc.) */
  extra?: Record<string, unknown>;
}

// -- User resolution and auth --

/**
 * Resolved user identity returned by a UserResolver.
 * Null means the user is not authorized.
 */
export interface ResolvedUser {
  /** Your internal user ID. */
  userId: string;
  /** Which agent handles this message. Falls back to config default if omitted. */
  agentId?: string;
  /** Conversation ID for multiple chats with the same agent. Defaults to "default". */
  sessionId?: string;
  /** Override environment for this user. */
  environmentId?: string;
  /** Arbitrary metadata passed to the provider session. */
  metadata?: Record<string, unknown>;
}

/**
 * Resolves a platform sender to an internal user and routes to an agent.
 * Return null to reject (unauthorized).
 *
 * The resolver receives the full InboundMessage so it can route based on
 * text commands, channel context, or any other message property.
 *
 * Implement this function and pass it to bridge.setUserResolver().
 */
export type UserResolver = (
  sender: Sender,
  platform: string,
  message: InboundMessage,
) => Promise<ResolvedUser | null>;

/**
 * Declares which optional capabilities a provider supports.
 * The bridge checks these before calling optional methods.
 */
export interface ProviderCapabilities {
  /** Provider supports interrupting a running session. */
  interrupt: boolean;
  /** Provider supports tool confirmation (permission policies). */
  toolConfirmation: boolean;
  /** Provider supports custom tools with client-side execution. */
  customTools: boolean;
  /** Provider emits thinking/reasoning events. */
  thinking: boolean;
}

// -- Events --

/**
 * Normalized events that the bridge knows how to handle.
 * The bridge routes these to channels (message, status, error)
 * or handles them internally (tool_use, custom_tool_request).
 *
 * Provider-specific events that don't fit these categories
 * should use the "raw" variant. The bridge forwards raw events
 * to registered event listeners but does not act on them.
 */
export type ProviderEvent =
  | { type: "message"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "tool_result"; output: string }
  | { type: "status"; status: "running" | "idle" | "error"; stopReason?: string }
  | { type: "custom_tool_request"; id: string; name: string; input: unknown }
  | { type: "error"; message: string }
  | { type: "raw"; eventType: string; data: unknown };

// -- Event listener --

export type ProviderEventListener = (
  sessionId: string,
  event: ProviderEvent,
) => void;

// -- Provider interface --

export interface Provider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;

  /** Create a new session. Provider interprets providerConfig for its own needs. */
  createSession(opts: CreateSessionOpts): Promise<ProviderSession>;

  /** Send a user message into an existing session. */
  sendMessage(sessionId: string, message: MessagePayload): Promise<void>;

  /** Open a stream and yield provider events. */
  stream(sessionId: string, signal: AbortSignal): AsyncIterable<ProviderEvent>;

  /** Destroy a session. */
  destroySession(sessionId: string): Promise<void>;

  /** Interrupt a running session. Only called if capabilities.interrupt is true. */
  interrupt?(sessionId: string): Promise<void>;

  /** Approve/deny a tool call. Only called if capabilities.toolConfirmation is true. */
  confirmTool?(
    sessionId: string,
    toolUseId: string,
    approved: boolean,
  ): Promise<void>;

  /** Provide a custom tool result. Only called if capabilities.customTools is true. */
  submitToolResult?(
    sessionId: string,
    toolUseId: string,
    result: unknown,
  ): Promise<void>;
}
