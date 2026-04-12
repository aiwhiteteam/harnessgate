import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLogger, setLogLevel } from "./logger.js";

describe("logger", () => {
  beforeEach(() => {
    setLogLevel("debug");
  });

  it("creates a logger with all four methods", () => {
    const log = createLogger("test");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  it("respects log level filtering", () => {
    setLogLevel("error");
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createLogger("test");
    log.info("should not appear");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logs when level is met", () => {
    setLogLevel("info");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = createLogger("test");
    log.error("should appear");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("includes scope in output", () => {
    setLogLevel("info");
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createLogger("my-scope");
    log.info("test message");
    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("[my-scope]");
    expect(output).toContain("test message");
    spy.mockRestore();
  });
});
