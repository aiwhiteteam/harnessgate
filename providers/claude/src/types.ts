/** Raw Claude SSE event shapes we care about. */
export interface ClaudeAgentMessageEvent {
  type: "agent.message";
  content: Array<{ type: string; text?: string }>;
}

export interface ClaudeAgentThinkingEvent {
  type: "agent.thinking";
  content: Array<{ type: string; thinking?: string }>;
}

export interface ClaudeAgentToolUseEvent {
  type: "agent.tool_use";
  name: string;
  input: unknown;
}

export interface ClaudeAgentCustomToolUseEvent {
  type: "agent.custom_tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ClaudeSessionStatusIdleEvent {
  type: "session.status_idle";
  stop_reason?: {
    type: string;
    event_ids?: string[];
  };
}

export interface ClaudeSessionStatusRunningEvent {
  type: "session.status_running";
}

export interface ClaudeSessionErrorEvent {
  type: "session.error";
  error?: { message?: string };
}

export interface ClaudeSessionStatusTerminatedEvent {
  type: "session.status_terminated";
}

export interface ClaudeUnknownEvent {
  type: string;
}

export type ClaudeSSEEvent =
  | ClaudeAgentMessageEvent
  | ClaudeAgentThinkingEvent
  | ClaudeAgentToolUseEvent
  | ClaudeAgentCustomToolUseEvent
  | ClaudeSessionStatusIdleEvent
  | ClaudeSessionStatusRunningEvent
  | ClaudeSessionErrorEvent
  | ClaudeSessionStatusTerminatedEvent
  | ClaudeUnknownEvent;
