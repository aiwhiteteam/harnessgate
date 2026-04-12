export interface Sender {
  id: string;
  username?: string;
  displayName?: string;
}

export interface Attachment {
  type: "image" | "audio" | "video" | "file";
  url?: string;
  data?: Buffer;
  mimeType?: string;
  filename?: string;
}

export interface InboundMessage {
  id: string;
  channel: string;
  channelId: string;
  threadId?: string;
  sender: Sender;
  text: string;
  attachments?: Attachment[];
  timestamp: number;
  chatType: "direct" | "group" | "channel" | "thread";
  raw?: unknown;
}

export interface OutboundMessage {
  text: string;
  attachments?: Attachment[];
  replyToId?: string;
}

export interface MessagePayload {
  text: string;
  attachments?: Attachment[];
}
