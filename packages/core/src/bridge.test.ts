import { describe, it, expect } from "vitest";
import { splitText } from "./bridge.js";

describe("splitText", () => {
  it("returns single-element array for short text", () => {
    expect(splitText("hello", 100)).toEqual(["hello"]);
  });

  it("returns text as-is when exactly at limit", () => {
    const text = "a".repeat(50);
    expect(splitText(text, 50)).toEqual([text]);
  });

  it("splits at newline when possible", () => {
    const text = "line one\nline two\nline three";
    const parts = splitText(text, 15);
    expect(parts[0]).toBe("line one");
    expect(parts.length).toBeGreaterThan(1);
  });

  it("splits at space when no newline available", () => {
    const text = "word1 word2 word3 word4";
    const parts = splitText(text, 12);
    expect(parts[0]).toBe("word1 word2");
    expect(parts[1]).toBe("word3 word4");
  });

  it("hard splits when no whitespace available", () => {
    const text = "a".repeat(20);
    const parts = splitText(text, 10);
    expect(parts).toEqual(["a".repeat(10), "a".repeat(10)]);
  });

  it("handles empty string", () => {
    expect(splitText("", 100)).toEqual([""]);
  });

  it("trims leading whitespace on continuation parts", () => {
    const text = "hello world";
    const parts = splitText(text, 6);
    expect(parts[0]).toBe("hello");
    expect(parts[1]).toBe("world");
  });
});
