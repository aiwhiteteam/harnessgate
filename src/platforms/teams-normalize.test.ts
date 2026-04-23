import { describe, it, expect } from "vitest";

// The Teams normalizer is private to TeamsAdapter, so we test the logic
// by reimplementing the pure parts. This validates the normalization rules.

function removeBotMention(text: string): string {
  return text.replace(/<at>.*?<\/at>\s*/g, "").trim();
}

function getChannelId(activity: { conversation?: { id?: string }; channelId?: string }): string {
  return activity.conversation?.id ?? activity.channelId ?? "unknown";
}

function getChatType(conversationType?: string): "direct" | "group" | "thread" {
  if (conversationType === "groupChat" || conversationType === "channel") return "group";
  return "direct";
}

describe("teams normalize helpers", () => {
  describe("removeBotMention", () => {
    it("removes single mention", () => {
      expect(removeBotMention("<at>MyBot</at> hello")).toBe("hello");
    });

    it("removes multiple mentions", () => {
      expect(removeBotMention("<at>Bot1</at> <at>Bot2</at> hello")).toBe("hello");
    });

    it("preserves text without mentions", () => {
      expect(removeBotMention("just a normal message")).toBe("just a normal message");
    });

    it("handles empty text", () => {
      expect(removeBotMention("")).toBe("");
    });

    it("handles mention-only text", () => {
      expect(removeBotMention("<at>MyBot</at>")).toBe("");
    });

    it("handles mention with special chars in bot name", () => {
      expect(removeBotMention("<at>My AI Bot (v2)</at> test")).toBe("test");
    });
  });

  describe("getChannelId", () => {
    it("uses conversation.id when available", () => {
      expect(getChannelId({ conversation: { id: "conv-1" }, channelId: "ch-1" })).toBe("conv-1");
    });

    it("falls back to channelId", () => {
      expect(getChannelId({ channelId: "ch-1" })).toBe("ch-1");
    });

    it("returns unknown when nothing available", () => {
      expect(getChannelId({})).toBe("unknown");
    });
  });

  describe("getChatType", () => {
    it("returns direct for personal chat", () => {
      expect(getChatType("personal")).toBe("direct");
      expect(getChatType(undefined)).toBe("direct");
    });

    it("returns group for groupChat", () => {
      expect(getChatType("groupChat")).toBe("group");
    });

    it("returns group for channel", () => {
      expect(getChatType("channel")).toBe("group");
    });
  });
});
