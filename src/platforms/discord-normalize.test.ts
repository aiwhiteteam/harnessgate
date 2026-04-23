import { describe, it, expect } from "vitest";
import { normalizeMessage } from "./discord-normalize.js";

// discord.js Collection is a Map with extra methods like .map()
function makeCollection(entries: Array<[string, Record<string, unknown>]> = []) {
  const map = new Map(entries);
  (map as any).map = (fn: (v: any, k: string, m: any) => any) => {
    const result: any[] = [];
    for (const [k, v] of map) result.push(fn(v, k, map));
    return result;
  };
  return map;
}

// Minimal mock factories matching the discord.js Message shape
function makeMessage(overrides: Record<string, unknown> = {}): any {
  return {
    id: "msg-1",
    content: "hello world",
    author: { id: "user-1", username: "alice", displayName: "Alice", bot: false },
    channel: {
      id: "ch-1",
      isDMBased: () => false,
      isThread: () => false,
    },
    attachments: makeCollection(),
    createdTimestamp: 1700000000000,
    ...overrides,
  };
}

describe("discord normalizeMessage", () => {
  it("normalizes a basic group message", () => {
    const msg = makeMessage();
    const result = normalizeMessage(msg);
    expect(result).not.toBeNull();
    expect(result!.platform).toBe("discord");
    expect(result!.channelId).toBe("ch-1");
    expect(result!.text).toBe("hello world");
    expect(result!.sender.id).toBe("user-1");
    expect(result!.sender.username).toBe("alice");
    expect(result!.chatType).toBe("group");
  });

  it("returns null for bot messages", () => {
    const msg = makeMessage({
      author: { id: "bot-1", username: "bot", bot: true },
    });
    expect(normalizeMessage(msg)).toBeNull();
  });

  it("returns null for empty messages", () => {
    const msg = makeMessage({ content: "", attachments: makeCollection() });
    expect(normalizeMessage(msg)).toBeNull();
  });

  it("detects DM chat type", () => {
    const msg = makeMessage({
      channel: {
        id: "dm-1",
        isDMBased: () => true,
        isThread: () => false,
      },
    });
    const result = normalizeMessage(msg);
    expect(result!.chatType).toBe("direct");
  });

  it("detects thread chat type with parent channel", () => {
    const msg = makeMessage({
      channel: {
        id: "thread-1",
        parentId: "parent-ch-1",
        isDMBased: () => false,
        isThread: () => true,
      },
    });
    const result = normalizeMessage(msg);
    expect(result!.chatType).toBe("thread");
    expect(result!.channelId).toBe("parent-ch-1");
    expect(result!.threadId).toBe("thread-1");
  });

  it("normalizes attachments", () => {
    const attachments = makeCollection([
      ["att-1", {
        url: "https://cdn.discord.com/image.png",
        name: "image.png",
        contentType: "image/png",
      }],
      ["att-2", {
        url: "https://cdn.discord.com/doc.pdf",
        name: "doc.pdf",
        contentType: "application/pdf",
      }],
    ]);
    const msg = makeMessage({ attachments });
    const result = normalizeMessage(msg);
    expect(result!.attachments).toHaveLength(2);
    expect(result!.attachments![0].type).toBe("image");
    expect(result!.attachments![0].filename).toBe("image.png");
    expect(result!.attachments![1].type).toBe("file");
  });

  it("maps audio and video content types", () => {
    const attachments = makeCollection([
      ["a", { url: "u", name: "a.mp3", contentType: "audio/mpeg" }],
      ["v", { url: "u", name: "v.mp4", contentType: "video/mp4" }],
    ]);
    const msg = makeMessage({ attachments });
    const result = normalizeMessage(msg);
    expect(result!.attachments![0].type).toBe("audio");
    expect(result!.attachments![1].type).toBe("video");
  });
});
