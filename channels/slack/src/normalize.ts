import type { InboundMessage } from "@harnessgate/core";

export interface SlackMessageEvent {
  type: string;
  text: string;
  user: string;
  channel: string;
  ts: string;
  thread_ts?: string;
  channel_type?: string;
  files?: Array<{
    id: string;
    name?: string;
    mimetype?: string;
    url_private?: string;
  }>;
}

export function normalizeMessage(event: SlackMessageEvent): InboundMessage | null {
  if (!event.text && (!event.files || event.files.length === 0)) return null;

  const isDirect = event.channel_type === "im";
  const isThread = !!event.thread_ts && event.thread_ts !== event.ts;

  let chatType: "direct" | "group" | "thread";
  if (isDirect) chatType = "direct";
  else if (isThread) chatType = "thread";
  else chatType = "group";

  const attachments = event.files?.map((f) => ({
    type: "file" as const,
    url: f.url_private,
    filename: f.name ?? undefined,
    mimeType: f.mimetype ?? undefined,
  }));

  return {
    id: event.ts,
    channel: "slack",
    channelId: event.channel,
    threadId: event.thread_ts,
    sender: {
      id: event.user,
    },
    text: event.text,
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
    timestamp: Math.floor(parseFloat(event.ts) * 1000),
    chatType,
    raw: event,
  };
}
