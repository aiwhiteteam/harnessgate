import { describe, it, expect } from "vitest";
import { normalizeMessage, type SlackMessageEvent } from "./slack-normalize.js";

function makeEvent(overrides: Partial<SlackMessageEvent> = {}): SlackMessageEvent {
  return {
    type: "message",
    text: "hello",
    user: "U123",
    channel: "C456",
    ts: "1700000000.000100",
    ...overrides,
  };
}

describe("slack normalizeMessage", () => {
  it("normalizes a basic channel message", () => {
    const result = normalizeMessage(makeEvent());
    expect(result).not.toBeNull();
    expect(result!.platform).toBe("slack");
    expect(result!.channelId).toBe("C456");
    expect(result!.text).toBe("hello");
    expect(result!.sender.id).toBe("U123");
    expect(result!.chatType).toBe("group");
  });

  it("returns null for empty messages", () => {
    expect(normalizeMessage(makeEvent({ text: "" }))).toBeNull();
  });

  it("detects DM via channel_type im", () => {
    const result = normalizeMessage(makeEvent({ channel_type: "im" }));
    expect(result!.chatType).toBe("direct");
  });

  it("detects thread when thread_ts differs from ts", () => {
    const result = normalizeMessage(
      makeEvent({ thread_ts: "1699999999.000000", ts: "1700000000.000100" }),
    );
    expect(result!.chatType).toBe("thread");
    expect(result!.threadId).toBe("1699999999.000000");
  });

  it("does not detect thread when thread_ts equals ts (parent message)", () => {
    const ts = "1700000000.000100";
    const result = normalizeMessage(makeEvent({ thread_ts: ts, ts }));
    expect(result!.chatType).toBe("group");
  });

  it("converts ts to millisecond timestamp", () => {
    const result = normalizeMessage(makeEvent({ ts: "1700000000.000100" }));
    expect(result!.timestamp).toBe(1700000000000);
  });

  it("normalizes file attachments", () => {
    const result = normalizeMessage(
      makeEvent({
        files: [
          { id: "F1", name: "report.pdf", mimetype: "application/pdf", url_private: "https://files.slack.com/report.pdf" },
        ],
      }),
    );
    expect(result!.attachments).toHaveLength(1);
    expect(result!.attachments![0].type).toBe("file");
    expect(result!.attachments![0].filename).toBe("report.pdf");
    expect(result!.attachments![0].url).toBe("https://files.slack.com/report.pdf");
  });

  it("accepts message with only files and no text", () => {
    const result = normalizeMessage(
      makeEvent({
        text: "",
        files: [{ id: "F1", name: "img.png", mimetype: "image/png" }],
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.text).toBe("");
  });
});
