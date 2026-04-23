import type { InboundMessage, Attachment } from "../index.js";

/**
 * Shape of the WhatsApp Cloud API webhook payload.
 * See: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */
export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<WhatsAppMessage>;
        statuses?: Array<unknown>;
      };
      field: string;
    }>;
  }>;
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "text" | "image" | "video" | "audio" | "document" | "sticker" | "location" | "contacts" | "reaction" | "interactive";
  text?: { body: string };
  image?: WhatsAppMedia;
  video?: WhatsAppMedia;
  audio?: WhatsAppMedia;
  document?: WhatsAppMedia & { filename?: string };
  sticker?: WhatsAppMedia;
}

interface WhatsAppMedia {
  id: string;
  mime_type?: string;
  caption?: string;
}

/**
 * Extract all inbound messages from a WhatsApp webhook payload.
 * Returns an array because one webhook POST can contain multiple messages.
 */
export function normalizeWebhook(
  payload: WhatsAppWebhookPayload,
  appId: string,
): InboundMessage[] {
  const results: InboundMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      if (!value.messages) continue;

      const contacts = value.contacts ?? [];

      for (const msg of value.messages) {
        const contact = contacts.find((c) => c.wa_id === msg.from);
        const text = extractText(msg);
        const attachments = extractAttachments(msg);

        if (!text && attachments.length === 0) continue;

        results.push({
          id: msg.id,
          platform: "whatsapp",
          channelId: msg.from,
          sender: {
            id: msg.from,
            displayName: contact?.profile.name,
          },
          text: text ?? "",
          attachments: attachments.length > 0 ? attachments : undefined,
          timestamp: parseInt(msg.timestamp, 10) * 1000,
          chatType: "direct",
          appId,
          raw: msg,
        });
      }
    }
  }

  return results;
}

function extractText(msg: WhatsAppMessage): string | undefined {
  if (msg.type === "text" && msg.text?.body) return msg.text.body;
  // Captions on media messages
  if (msg.image?.caption) return msg.image.caption;
  if (msg.video?.caption) return msg.video.caption;
  if (msg.document?.caption) return msg.document.caption;
  return undefined;
}

function extractAttachments(msg: WhatsAppMessage): Attachment[] {
  const attachments: Attachment[] = [];

  const mediaMap: Array<[string, Attachment["type"], WhatsAppMedia | undefined, string?]> = [
    ["image", "image", msg.image],
    ["video", "video", msg.video],
    ["audio", "audio", msg.audio],
    ["document", "file", msg.document, (msg.document as WhatsAppMedia & { filename?: string })?.filename],
    ["sticker", "image", msg.sticker],
  ];

  for (const [type, attType, media, filename] of mediaMap) {
    if (msg.type === type && media) {
      attachments.push({
        type: attType,
        // Media URL must be fetched via Graph API using media.id — store the ID for now
        url: `whatsapp://media/${media.id}`,
        mimeType: media.mime_type,
        filename: filename as string | undefined,
      });
    }
  }

  return attachments;
}
