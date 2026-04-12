import type { InboundMessage, Attachment } from "@harnessgate/core";
import type { Context } from "grammy";

/**
 * Normalize a grammY context into a HarnessGate InboundMessage.
 */
export function normalizeMessage(ctx: Context): InboundMessage | null {
  const msg = ctx.message ?? ctx.editedMessage;
  if (!msg) return null;

  const text = msg.text ?? msg.caption ?? "";
  if (!text && !msg.photo && !msg.document && !msg.voice && !msg.audio && !msg.video) {
    return null;
  }

  const chatId = String(msg.chat.id);
  const chatType = msg.chat.type === "private" ? "direct" as const : "group" as const;
  const threadId = msg.message_thread_id ? String(msg.message_thread_id) : undefined;

  const sender = {
    id: String(msg.from?.id ?? "unknown"),
    username: msg.from?.username,
    displayName: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || undefined,
  };

  const attachments = extractAttachments(ctx);

  return {
    id: String(msg.message_id),
    channel: "telegram",
    channelId: chatId,
    threadId,
    sender,
    text,
    attachments: attachments.length > 0 ? attachments : undefined,
    timestamp: msg.date * 1000,
    chatType,
    raw: msg,
  };
}

function extractAttachments(ctx: Context): Attachment[] {
  const msg = ctx.message ?? ctx.editedMessage;
  if (!msg) return [];

  const attachments: Attachment[] = [];

  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    attachments.push({
      type: "image",
      url: largest.file_id,
      mimeType: "image/jpeg",
    });
  }

  if (msg.document) {
    attachments.push({
      type: "file",
      url: msg.document.file_id,
      filename: msg.document.file_name ?? undefined,
      mimeType: msg.document.mime_type ?? undefined,
    });
  }

  if (msg.voice) {
    attachments.push({
      type: "audio",
      url: msg.voice.file_id,
      mimeType: msg.voice.mime_type ?? "audio/ogg",
    });
  }

  if (msg.audio) {
    attachments.push({
      type: "audio",
      url: msg.audio.file_id,
      mimeType: msg.audio.mime_type ?? undefined,
      filename: msg.audio.file_name ?? undefined,
    });
  }

  if (msg.video) {
    attachments.push({
      type: "video",
      url: msg.video.file_id,
      mimeType: msg.video.mime_type ?? undefined,
    });
  }

  return attachments;
}
