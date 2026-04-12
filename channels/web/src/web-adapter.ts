import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelContext,
  ChannelTarget,
  SendResult,
  OutboundMessage,
  InboundMessage,
} from "@harnessgate/core";
import { createLogger } from "@harnessgate/core";

const log = createLogger("channel-web");

const __dirname = dirname(fileURLToPath(import.meta.url));

interface WebClient {
  ws: WebSocket;
  id: string;
}

export class WebAdapter implements ChannelAdapter {
  readonly id = "web";
  readonly capabilities: ChannelCapabilities = {
    maxTextLength: 100_000,
    supportsMarkdown: true,
    supportsThreads: false,
    supportsTypingIndicator: true,
    supportsAttachments: false,
  };

  private server?: ReturnType<typeof createServer>;
  private wss?: WebSocketServer;
  private clients = new Map<string, WebClient>();
  private onMessageHandler?: (msg: InboundMessage) => void;
  private cachedHtml?: string;

  async start(ctx: ChannelContext): Promise<void> {
    this.onMessageHandler = ctx.onMessage;
    const port = (ctx.config.port as number) ?? 3000;

    // Cache HTML at startup
    try {
      this.cachedHtml = readFileSync(join(__dirname, "static", "index.html"), "utf-8");
    } catch {
      this.cachedHtml = this.getFallbackHtml();
    }

    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url === "/" || req.url === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(this.cachedHtml);
      } else if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", clients: this.clients.size }));
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on("connection", (ws: WebSocket) => {
      const clientId = `web_${randomUUID().slice(0, 8)}`;
      this.clients.set(clientId, { ws, id: clientId });
      log.info(`Client connected: ${clientId}`);

      ws.on("message", (data: Buffer) => {
        try {
          const parsed = JSON.parse(data.toString()) as { text?: string };
          if (!parsed.text) return;

          const msg: InboundMessage = {
            id: `${clientId}_${Date.now()}`,
            channel: "web",
            channelId: clientId,
            sender: { id: clientId, displayName: `Web User ${clientId}` },
            text: parsed.text,
            timestamp: Date.now(),
            chatType: "direct",
          };

          this.onMessageHandler?.(msg);
        } catch (err) {
          log.error("Failed to parse WebSocket message", err);
        }
      });

      ws.on("close", () => {
        this.clients.delete(clientId);
        log.info(`Client disconnected: ${clientId}`);
      });

      ws.on("error", (err: Error) => {
        log.error(`WebSocket error for ${clientId}`, err);
        this.clients.delete(clientId);
      });

      // Send welcome
      ws.send(JSON.stringify({ type: "connected", clientId }));
    });

    return new Promise((resolve) => {
      this.server!.listen(port, () => {
        log.info(`Web UI listening on http://localhost:${port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    this.clients.clear();
    this.wss?.close();

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  async send(target: ChannelTarget, message: OutboundMessage): Promise<SendResult> {
    const client = this.clients.get(target.channelId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return { success: false, error: "Client not connected" };
    }

    client.ws.send(JSON.stringify({ type: "message", text: message.text }));
    return { success: true };
  }

  async sendTyping(target: ChannelTarget): Promise<void> {
    const client = this.clients.get(target.channelId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ type: "typing" }));
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
let ws, typing;

function addMsg(text, cls) {
  if (typing) { typing.remove(); typing = null; }
  const div = document.createElement('div');
  div.className = 'msg ' + cls;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host);
  ws.onopen = () => addMsg('Connected', 'system');
  ws.onclose = () => { addMsg('Disconnected. Reconnecting...', 'system'); setTimeout(connect, 2000); };
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'message') addMsg(data.text, 'agent');
    else if (data.type === 'typing') {
      if (!typing) { typing = document.createElement('div'); typing.className = 'typing'; typing.textContent = 'Thinking...'; messages.appendChild(typing); messages.scrollTop = messages.scrollHeight; }
    }
    else if (data.type === 'connected') addMsg('Session ready', 'system');
  };
}

function send() {
  const text = input.value.trim();
  if (!text || !ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ text }));
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
