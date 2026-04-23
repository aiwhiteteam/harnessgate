import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type {
  PlatformAdapter,
  PlatformCapabilities,
  PlatformContext,
  ChannelTarget,
  SendResult,
  OutboundMessage,
} from "../index.js";
import { createLogger } from "../index.js";
import { normalizeWebhook, type WhatsAppWebhookPayload } from "./whatsapp-normalize.js";

const log = createLogger("platform-whatsapp");

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

interface WhatsAppInstance {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
}

export class WhatsAppAdapter implements PlatformAdapter {
  readonly id = "whatsapp";
  readonly capabilities: PlatformCapabilities = {
    maxTextLength: 4096,
    supportsMarkdown: false,
    supportsThreads: false,
    supportsTypingIndicator: false,
    supportsAttachments: true,
  };

  private server?: ReturnType<typeof createServer>;
  private instances = new Map<string, WhatsAppInstance>();
  private onMessageHandler?: PlatformContext["onMessage"];

  async start(ctx: PlatformContext): Promise<void> {
    this.onMessageHandler = ctx.onMessage;
    const port = (ctx.config.port as number) ?? 3000;

    this.server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

      if (url.pathname === "/webhook" && req.method === "GET") {
        this.handleVerification(url, res);
      } else if (url.pathname === "/webhook" && req.method === "POST") {
        this.handleWebhook(req, res);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    // Register the first instance from config if provided
    if (ctx.config.phoneNumberId && ctx.config.accessToken && ctx.config.verifyToken) {
      await this.connect({
        phoneNumberId: ctx.config.phoneNumberId as string,
        accessToken: ctx.config.accessToken as string,
        verifyToken: ctx.config.verifyToken as string,
      }, ctx);
    }

    return new Promise((resolve) => {
      this.server!.listen(port, () => {
        log.info(`WhatsApp webhook listening on http://localhost:${port}/webhook`);
        resolve();
      });
    });
  }

  async connect(credentials: Record<string, unknown>, _ctx: PlatformContext): Promise<string> {
    const phoneNumberId = credentials.phoneNumberId as string;
    const accessToken = credentials.accessToken as string;
    const verifyToken = credentials.verifyToken as string;

    if (!phoneNumberId || !accessToken || !verifyToken) {
      throw new Error("WhatsApp connect requires phoneNumberId, accessToken, and verifyToken");
    }

    this.instances.set(phoneNumberId, { phoneNumberId, accessToken, verifyToken });
    log.info(`WhatsApp instance registered: phoneNumberId=${phoneNumberId}`);
    return phoneNumberId;
  }

  async disconnect(appId: string): Promise<void> {
    this.instances.delete(appId);
    log.info(`WhatsApp instance removed: phoneNumberId=${appId}`);
  }

  activeConnections(): string[] {
    return [...this.instances.keys()];
  }

  async stop(): Promise<void> {
    this.instances.clear();
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  async send(target: ChannelTarget, message: OutboundMessage): Promise<SendResult> {
    const instance = this.instances.get(target.appId ?? "") ?? this.instances.values().next().value;
    if (!instance) {
      return { success: false, error: "No WhatsApp instance configured" };
    }

    try {
      const response = await fetch(`${GRAPH_API_BASE}/${instance.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${instance.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: target.channelId,
          type: "text",
          text: { body: message.text },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        log.error(`WhatsApp send failed: ${response.status} ${err}`);
        return { success: false, error: `HTTP ${response.status}: ${err}` };
      }

      const result = await response.json() as { messages?: Array<{ id: string }> };
      return { success: true, messageId: result.messages?.[0]?.id };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`Failed to send to ${target.channelId}: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  // -- Webhook handlers -------------------------------------------------------

  private handleVerification(url: URL, res: ServerResponse): void {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode !== "subscribe" || !token || !challenge) {
      res.writeHead(400);
      res.end("Missing verification parameters");
      return;
    }

    // Check if the verify token matches any registered instance
    const matched = [...this.instances.values()].some((i) => i.verifyToken === token);
    if (!matched) {
      log.warn(`Webhook verification failed: unknown verify_token`);
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    log.info("Webhook verification successful");
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(challenge);
  }

  private handleWebhook(req: IncomingMessage, res: ServerResponse): void {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => {
      // Always respond 200 quickly to avoid Meta retries
      res.writeHead(200);
      res.end("EVENT_RECEIVED");

      try {
        const payload = JSON.parse(body) as WhatsAppWebhookPayload;
        if (payload.object !== "whatsapp_business_account") return;

        // Determine which instance this is for
        const phoneNumberId = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
        const appId = phoneNumberId ?? "";

        const messages = normalizeWebhook(payload, appId);
        for (const msg of messages) {
          this.onMessageHandler?.(msg);
        }
      } catch (err) {
        log.error("Failed to process webhook:", err);
      }
    });
  }
}
