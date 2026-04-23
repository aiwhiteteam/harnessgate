import { describe, it, expect } from "vitest";
import { normalizeWebhook, type WhatsAppWebhookPayload } from "./whatsapp-normalize.js";

function makePayload(
  messages: Record<string, unknown>[],
  contacts: Array<{ profile: { name: string }; wa_id: string }> = [],
): WhatsAppWebhookPayload {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "entry-1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "+1234567890",
                phone_number_id: "phone-1",
              },
              contacts,
              messages: messages as any,
            },
          },
        ],
      },
    ],
  };
}

describe("whatsapp normalizeWebhook", () => {
  it("normalizes a text message", () => {
    const results = normalizeWebhook(
      makePayload(
        [{ from: "5511999999999", id: "wamid.1", timestamp: "1700000000", type: "text", text: { body: "Hello" } }],
        [{ profile: { name: "Bob" }, wa_id: "5511999999999" }],
      ),
      "phone-1",
    );
    expect(results).toHaveLength(1);
    expect(results[0].platform).toBe("whatsapp");
    expect(results[0].text).toBe("Hello");
    expect(results[0].channelId).toBe("5511999999999");
    expect(results[0].sender.id).toBe("5511999999999");
    expect(results[0].sender.displayName).toBe("Bob");
    expect(results[0].chatType).toBe("direct");
    expect(results[0].timestamp).toBe(1700000000000);
  });

  it("returns empty array for status-only webhooks", () => {
    const payload = makePayload([]);
    payload.entry[0].changes[0].value.messages = undefined;
    const results = normalizeWebhook(payload, "phone-1");
    expect(results).toHaveLength(0);
  });

  it("skips non-messages field changes", () => {
    const payload = makePayload([]);
    payload.entry[0].changes[0].field = "statuses";
    const results = normalizeWebhook(payload, "phone-1");
    expect(results).toHaveLength(0);
  });

  it("normalizes image message with caption", () => {
    const results = normalizeWebhook(
      makePayload([
        {
          from: "5511999999999",
          id: "wamid.2",
          timestamp: "1700000000",
          type: "image",
          image: { id: "media-1", mime_type: "image/jpeg", caption: "Check this out" },
        },
      ]),
      "phone-1",
    );
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe("Check this out");
    expect(results[0].attachments).toHaveLength(1);
    expect(results[0].attachments![0].type).toBe("image");
    expect(results[0].attachments![0].url).toBe("whatsapp://media/media-1");
    expect(results[0].attachments![0].mimeType).toBe("image/jpeg");
  });

  it("normalizes document message", () => {
    const results = normalizeWebhook(
      makePayload([
        {
          from: "5511999999999",
          id: "wamid.3",
          timestamp: "1700000000",
          type: "document",
          document: { id: "media-2", mime_type: "application/pdf", filename: "report.pdf" },
        },
      ]),
      "phone-1",
    );
    expect(results).toHaveLength(1);
    expect(results[0].attachments).toHaveLength(1);
    expect(results[0].attachments![0].type).toBe("file");
    expect(results[0].attachments![0].filename).toBe("report.pdf");
  });

  it("normalizes audio message", () => {
    const results = normalizeWebhook(
      makePayload([
        {
          from: "5511999999999",
          id: "wamid.4",
          timestamp: "1700000000",
          type: "audio",
          audio: { id: "media-3", mime_type: "audio/ogg" },
        },
      ]),
      "phone-1",
    );
    expect(results).toHaveLength(1);
    expect(results[0].attachments![0].type).toBe("audio");
  });

  it("handles multiple messages in one webhook", () => {
    const results = normalizeWebhook(
      makePayload([
        { from: "111", id: "w1", timestamp: "1700000000", type: "text", text: { body: "msg1" } },
        { from: "222", id: "w2", timestamp: "1700000001", type: "text", text: { body: "msg2" } },
      ]),
      "phone-1",
    );
    expect(results).toHaveLength(2);
    expect(results[0].text).toBe("msg1");
    expect(results[1].text).toBe("msg2");
  });

  it("skips location messages (no text or attachments)", () => {
    const results = normalizeWebhook(
      makePayload([
        { from: "111", id: "w1", timestamp: "1700000000", type: "location" },
      ]),
      "phone-1",
    );
    expect(results).toHaveLength(0);
  });

  it("maps sender displayName from contacts", () => {
    const results = normalizeWebhook(
      makePayload(
        [{ from: "111", id: "w1", timestamp: "1700000000", type: "text", text: { body: "hi" } }],
        [{ profile: { name: "John Doe" }, wa_id: "111" }],
      ),
      "phone-1",
    );
    expect(results[0].sender.displayName).toBe("John Doe");
  });

  it("handles missing contacts gracefully", () => {
    const results = normalizeWebhook(
      makePayload(
        [{ from: "111", id: "w1", timestamp: "1700000000", type: "text", text: { body: "hi" } }],
      ),
      "phone-1",
    );
    expect(results[0].sender.displayName).toBeUndefined();
  });
});
