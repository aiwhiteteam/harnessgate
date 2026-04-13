import type { InboundMessage, Attachment } from "@harnessgate/core";
import type { Message } from "discord.js";

export function normalizeMessage(msg: Message): InboundMessage | null {
  // Ignore bot messages
  if (msg.author.bot) return null;

  const text = msg.content;
  if (!text && msg.attachments.size === 0) return null;

  const isDirect = msg.channel.isDMBased();
  const isThread = msg.channel.isThread();

  let chatType: "direct" | "group" | "thread";
  if (isDirect) chatType = "direct";
  else if (isThread) chatType = "thread";
  else chatType = "group";

  // For threads, use parent channel as channelId and thread as threadId
  const channelId = isThread && "parentId" in msg.channel && msg.channel.parentId
    ? msg.channel.parentId
    : msg.channel.id;
  const threadId = isThread ? msg.channel.id : undefined;

  const attachments: Attachment[] = msg.attachments.map((att) => {
    let type: Attachment["type"] = "file";
    if (att.contentType?.startsWith("image/")) type = "image";
    else if (att.contentType?.startsWith("audio/")) type = "audio";
    else if (att.contentType?.startsWith("video/")) type = "video";

    return {
      type,
      url: att.url,
      filename: att.name ?? undefined,
      mimeType: att.contentType ?? undefined,
    };
  });

  return {
    id: msg.id,
    channel: "discord",
    channelId,
    threadId,
    sender: {
      id: msg.author.id,
      username: msg.author.username,
      displayName: msg.author.displayName ?? undefined,
    },
    text,
    attachments: attachments.length > 0 ? attachments : undefined,
    timestamp: msg.createdTimestamp,
    chatType,
    raw: msg,
  };
}
