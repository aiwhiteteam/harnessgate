import { describe, it, expect, beforeEach } from "vitest";
import { SessionMap, buildSessionKey, type SessionEntry } from "./session-map.js";

describe("buildSessionKey", () => {
  it("builds a composite key", () => {
    expect(buildSessionKey("telegram", "direct", "12345")).toBe("telegram:direct:12345");
  });

  it("handles group chats", () => {
    expect(buildSessionKey("discord", "group", "guild-99")).toBe("discord:group:guild-99");
  });

  it("includes userId when provided", () => {
    expect(buildSessionKey("telegram", "group", "chat-1", "user-42")).toBe("telegram:group:chat-1:user-42");
  });

  it("omits userId segment when undefined", () => {
    expect(buildSessionKey("telegram", "direct", "12345", undefined)).toBe("telegram:direct:12345");
  });
});

describe("SessionMap", () => {
  let map: SessionMap;

  function makeEntry(overrides: Partial<SessionEntry> = {}): SessionEntry {
    return {
      key: "test:direct:1",
      providerSessionId: "sesn_01",
      channel: "test",
      channelId: "1",
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      ...overrides,
    };
  }

  beforeEach(() => {
    map = new SessionMap();
  });

  it("get returns undefined for missing key", () => {
    expect(map.get("nonexistent")).toBeUndefined();
  });

  it("set and get round-trip", () => {
    const entry = makeEntry();
    map.set(entry.key, entry);
    expect(map.get(entry.key)).toBe(entry);
  });

  it("delete removes entry", () => {
    const entry = makeEntry();
    map.set(entry.key, entry);
    expect(map.delete(entry.key)).toBe(true);
    expect(map.get(entry.key)).toBeUndefined();
  });

  it("delete returns false for missing key", () => {
    expect(map.delete("nonexistent")).toBe(false);
  });

  it("findByProviderSession finds entry", () => {
    const entry = makeEntry({ providerSessionId: "sesn_abc" });
    map.set(entry.key, entry);
    expect(map.findByProviderSession("sesn_abc")).toBe(entry);
  });

  it("findByProviderSession returns undefined if not found", () => {
    expect(map.findByProviderSession("missing")).toBeUndefined();
  });

  it("touch updates lastActiveAt", () => {
    const entry = makeEntry({ lastActiveAt: 1000 });
    map.set(entry.key, entry);
    map.touch(entry.key);
    expect(entry.lastActiveAt).toBeGreaterThan(1000);
  });

  it("list returns all entries", () => {
    const e1 = makeEntry({ key: "a:direct:1", providerSessionId: "s1" });
    const e2 = makeEntry({ key: "b:direct:2", providerSessionId: "s2" });
    map.set(e1.key, e1);
    map.set(e2.key, e2);
    expect(map.list()).toHaveLength(2);
  });

  it("size returns count", () => {
    expect(map.size).toBe(0);
    map.set("k1", makeEntry({ key: "k1" }));
    expect(map.size).toBe(1);
  });

  describe("prune", () => {
    it("removes idle sessions and returns their entries", () => {
      const old = makeEntry({ key: "old", lastActiveAt: Date.now() - 10_000 });
      const recent = makeEntry({ key: "recent", lastActiveAt: Date.now() });
      map.set(old.key, old);
      map.set(recent.key, recent);

      const pruned = map.prune(5_000);
      expect(pruned).toHaveLength(1);
      expect(pruned[0].key).toBe("old");
      expect(map.get("old")).toBeUndefined();
      expect(map.get("recent")).toBeDefined();
    });

    it("returns empty array when nothing to prune", () => {
      const entry = makeEntry({ lastActiveAt: Date.now() });
      map.set(entry.key, entry);
      expect(map.prune(60_000)).toHaveLength(0);
    });
  });
});
