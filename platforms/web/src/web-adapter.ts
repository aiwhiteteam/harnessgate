import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  PlatformAdapter,
  PlatformCapabilities,
  PlatformContext,
  ChannelTarget,
  SendResult,
  OutboundMessage,
  InboundMessage,
} from "@harnessgate/core";
import { createLogger } from "@harnessgate/core";

const log = createLogger("platform-web");

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Active SSE connection for a user. */
interface SSEClient {
  res: ServerResponse;
  userId: string;
}

export class WebAdapter implements PlatformAdapter {
  readonly id = "web";
  readonly capabilities: PlatformCapabilities = {
    maxTextLength: 100_000,
    supportsMarkdown: true,
    supportsThreads: false,
    supportsTypingIndicator: true,
    supportsAttachments: false,
  };

  private server?: ReturnType<typeof createServer>;
  private sseClients = new Map<string, SSEClient>();
  private onMessageHandler?: (msg: InboundMessage) => void;
  private cachedHtml?: string;

  async start(ctx: PlatformContext): Promise<void> {
    this.onMessageHandler = ctx.onMessage;
    const port = (ctx.config.port as number) ?? 3000;

    // Cache HTML at startup
    try {
      this.cachedHtml = readFileSync(join(__dirname, "static", "index.html"), "utf-8");
    } catch {
      this.cachedHtml = this.getFallbackHtml();
    }

    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const path = url.pathname;

      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (path === "/" || path === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(this.cachedHtml);
      } else if (path === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", clients: this.sseClients.size }));
      } else if (path === "/stream" && req.method === "GET") {
        this.handleSSE(req, res);
      } else if (path === "/message" && req.method === "POST") {
        this.handleMessage(req, res);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    return new Promise((resolve) => {
      this.server!.listen(port, () => {
        log.info(`Web UI listening on http://localhost:${port}`);
        resolve();
      });
    });
  }

  /** GET /stream — SSE connection. User identified by Authorization header or ?token= query param. */
  private handleSSE(req: IncomingMessage, res: ServerResponse): void {
    const userId = this.extractUserId(req);
    if (!userId) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing Authorization header or ?token= query param" }));
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send initial connected event
    res.write(`data: ${JSON.stringify({ type: "connected", userId })}\n\n`);

    this.sseClients.set(userId, { res, userId });
    log.info(`SSE client connected: ${userId}`);

    req.on("close", () => {
      this.sseClients.delete(userId);
      log.info(`SSE client disconnected: ${userId}`);
    });
  }

  /** POST /message — send a message. Body: { text, agentId? }. */
  private handleMessage(req: IncomingMessage, res: ServerResponse): void {
    const userId = this.extractUserId(req);
    if (!userId) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing Authorization header or ?token= query param" }));
      return;
    }

    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body) as { text?: string; agentId?: string };
        if (!parsed.text) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing 'text' field" }));
          return;
        }

        const msg: InboundMessage = {
          id: `web_${userId}_${Date.now()}`,
          platform: "web",
          channelId: userId,
          sender: { id: userId },
          text: parsed.text,
          timestamp: Date.now(),
          chatType: "direct",
        };

        this.onMessageHandler?.(msg);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
  }

  /** Extract user ID from Authorization header (Bearer token) or ?token= query param. */
  private extractUserId(req: IncomingMessage): string | null {
    // Authorization: Bearer <userId or JWT>
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      return auth.slice(7).trim() || null;
    }

    // ?token=<userId>
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    return token || null;
  }

  async stop(): Promise<void> {
    for (const client of this.sseClients.values()) {
      client.res.end();
    }
    this.sseClients.clear();

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  async send(target: ChannelTarget, message: OutboundMessage): Promise<SendResult> {
    const client = this.sseClients.get(target.channelId);
    if (!client) {
      return { success: false, error: "Client not connected" };
    }

    client.res.write(`data: ${JSON.stringify({ type: "message", text: message.text })}\n\n`);
    return { success: true };
  }

  async sendTyping(target: ChannelTarget): Promise<void> {
    const client = this.sseClients.get(target.channelId);
    if (client) {
      client.res.write(`data: ${JSON.stringify({ type: "typing" })}\n\n`);
    }
  }

  private getFallbackHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HarnessGate</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e0e0e0; height: 100vh; display: flex; flex-direction: column; }
  #header { padding: 16px 24px; border-bottom: 1px solid #222; font-size: 14px; font-weight: 600; color: #888; }
  #messages { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 12px; }
  .msg { max-width: 720px; padding: 12px 16px; border-radius: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .msg.user { background: #1a3a5c; align-self: flex-end; }
  .msg.agent { background: #1a1a1a; border: 1px solid #333; }
  .msg.system { color: #666; font-size: 13px; align-self: center; }
  .typing { color: #666; font-style: italic; padding: 8px 16px; }
  #input-area { padding: 16px 24px; border-top: 1px solid #222; display: flex; gap: 12px; }
  #input { flex: 1; padding: 12px 16px; border-radius: 8px; border: 1px solid #333; background: #111; color: #e0e0e0; font-size: 15px; outline: none; }
  #input:focus { border-color: #555; }
  #send { padding: 12px 24px; border-radius: 8px; border: none; background: #2563eb; color: white; font-size: 15px; cursor: pointer; }
  #send:hover { background: #1d4ed8; }
  #send:disabled { background: #333; cursor: not-allowed; }
</style>
</head>
<body>
<div id="header">HarnessGate Web UI</div>
<div id="messages"></div>
<div id="input-area">
  <input id="input" type="text" placeholder="Type a message..." autocomplete="off" />
  <button id="send">Send</button>
</div>
<script>
const messages = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
let eventSource, typing;
const TOKEN = prompt('Enter your user ID or token:') || 'anonymous';

function addMsg(text, cls) {
  if (typing) { typing.remove(); typing = null; }
  const div = document.createElement('div');
  div.className = 'msg ' + cls;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function connect() {
  eventSource = new EventSource('/stream?token=' + encodeURIComponent(TOKEN));
  eventSource.onopen = () => addMsg('Connected', 'system');
  eventSource.onerror = () => { addMsg('Disconnected. Reconnecting...', 'system'); };
  eventSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'message') addMsg(data.text, 'agent');
    else if (data.type === 'typing') {
      if (!typing) { typing = document.createElement('div'); typing.className = 'typing'; typing.textContent = 'Thinking...'; messages.appendChild(typing); messages.scrollTop = messages.scrollHeight; }
    }
    else if (data.type === 'connected') addMsg('Session ready (' + data.userId + ')', 'system');
  };
}

function send() {
  const text = input.value.trim();
  if (!text) return;
  fetch('/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
    body: JSON.stringify({ text })
  });
  addMsg(text, 'user');
  input.value = '';
}

sendBtn.onclick = send;
input.onkeydown = (e) => { if (e.key === 'Enter') send(); };
connect();
</script>
</body>
</html>`;
  }
}
