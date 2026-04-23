import { describe, it, expect, beforeEach } from "vitest";
import { MemorySessionStore, buildSessionKey, type SessionEntry } from "./session-map.js";

describe("buildSessionKey", () => {
  it("builds a composite key", () => {
    expect(buildSessionKey({ platform: "telegram", chatType: "direct", channelId: "12345" }))
      .toBe("telegram:direct:12345");
  });

  it("handles group chats", () => {
    expect(buildSessionKey({ platform: "discord", chatType: "group", channelId: "guild-99" }))
      .toBe("discord:group:guild-99");
  });

  it("includes userId when provided", () => {
    expect(buildSessionKey({ platform: "telegram", chatType: "direct", channelId: "chat-1", userId: "user-42" }))
      .toBe("telegram:direct:chat-1:u:user-42");
  });

  it("includes threadId when provided", () => {
    expect(buildSessionKey({ platform: "slack", chatType: "thread", channelId: "ch1", threadId: "ts123" }))
      .toBe("slack:thread:ch1:t:ts123");
  });

  it("includes agentId and sessionId when provided", () => {
    expect(buildSessionKey({ platform: "web", chatType: "direct", channelId: "c1", userId: "u1", agentId: "agent_coding", sessionId: "conv_1" }))
      .toBe("web:direct:c1:u:u1:a:agent_coding:s:conv_1");
  });

  it("omits undefined segments", () => {
    expect(buildSessionKey({ platform: "telegram", chatType: "direct", channelId: "12345", userId: undefined }))
      .toBe("telegram:direct:12345");
  });

  it("includes appId when provided", () => {
    expect(buildSessionKey({ platform: "telegram", chatType: "direct", channelId: "12345", appId: "123456789" }))
      .toBe("telegram:direct:12345:app:123456789");
  });
});

describe("MemorySessionStore", () => {
  let store: MemorySessionStore;

  function makeEntry(overrides: Partial<SessionEntry> = {}): SessionEntry {
    return {
      key: "test:direct:1",
      providerSessionId: "sesn_01",
      platform: "test",
      channelId: "1",
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      ...overrides,
    };
  }

  beforeEach(() => {
    store = new MemorySessionStore();
  });

  it("get returns null for missing key", async () => {
    expect(await store.get("nonexistent")).toBeNull();
  });

  it("set and get round-trip", async () => {
    const entry = makeEntry();
    await store.set(entry.key, entry);
    expect(await store.get(entry.key)).toBe(entry);
  });

  it("delete removes entry", async () => {
    const entry = makeEntry();
    await store.set(entry.key, entry);
    expect(await store.delete(entry.key)).toBe(true);
    expect(await store.get(entry.key)).toBeNull();
  });

  it("delete returns false for missing key", async () => {
    expect(await store.delete("nonexistent")).toBe(false);
  });

  it("touch updates lastActiveAt", async () => {
    const entry = makeEntry({ lastActiveAt: 1000 });
    await store.set(entry.key, entry);
    await store.touch(entry.key);
    const updated = await store.get(entry.key);
    expect(updated!.lastActiveAt).toBeGreaterThan(1000);
  });

});
