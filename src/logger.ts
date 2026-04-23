export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function format(level: LogLevel, scope: string, msg: string): string {
  const ts = new Date().toISOString();
  return `${ts} [${level.toUpperCase()}] [${scope}] ${msg}`;
}

export function createLogger(scope: string) {
  return {
    debug(msg: string, data?: unknown) {
      if (!shouldLog("debug")) return;
      console.debug(format("debug", scope, msg), data ?? "");
    },
    info(msg: string, data?: unknown) {
      if (!shouldLog("info")) return;
      console.info(format("info", scope, msg), data ?? "");
    },
    warn(msg: string, data?: unknown) {
      if (!shouldLog("warn")) return;
      console.warn(format("warn", scope, msg), data ?? "");
    },
    error(msg: string, data?: unknown) {
      if (!shouldLog("error")) return;
      console.error(format("error", scope, msg), data ?? "");
    },
  };
}
