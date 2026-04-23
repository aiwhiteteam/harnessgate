import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  TurnContext,
  ActivityTypes,
} from "botbuilder";
import type {
  Activity,
  ConversationReference,
} from "botbuilder";
import type {
  PlatformAdapter,
  PlatformCapabilities,
  PlatformContext,
  ChannelTarget,
  SendResult,
  OutboundMessage,
  InboundMessage,
} from "../index.js";
import { createLogger } from "../index.js";

const log = createLogger("platform-teams");

interface TeamsInstance {
  appId: string;
  appPassword: string;
  adapter: CloudAdapter;
  conversationRefs: Map<string, Partial<ConversationReference>>;
}

export class TeamsAdapter implements PlatformAdapter {
  readonly id = "teams";
  readonly capabilities: PlatformCapabilities = {
    maxTextLength: 28000,
    supportsMarkdown: true,
    supportsThreads: true,
    supportsTypingIndicator: true,
    supportsAttachments: true,
  };

  private server?: ReturnType<typeof createServer>;
  private instances = new Map<string, TeamsInstance>();
  private onMessageHandler?: PlatformContext["onMessage"];

  async start(ctx: PlatformContext): Promise<void> {
    this.onMessageHandler = ctx.onMessage;
    const port = (ctx.config.port as number) ?? 3978;

    // Register instance from config if provided
    if (ctx.config.appId && ctx.config.appPassword) {
      await this.connect(
        {
          appId: ctx.config.appId as string,
          appPassword: ctx.config.appPassword as string,
        },
        ctx,
      );
    }

    this.server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.url === "/api/messages" && req.method === "POST") {
        await this.handleActivity(req, res);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    return new Promise((resolve) => {
      this.server!.listen(port, () => {
        log.info(`Teams bot listening on http://localhost:${port}/api/messages`);
        resolve();
      });
    });
  }

  async connect(
    credentials: Record<string, unknown>,
    _ctx: PlatformContext,
  ): Promise<string> {
    const appId = credentials.appId as string;
    const appPassword = credentials.appPassword as string;

    if (!appId || !appPassword) {
      throw new Error("Teams connect requires appId and appPassword");
    }

    const botAuth = new ConfigurationBotFrameworkAuthentication({
      MicrosoftAppId: appId,
      MicrosoftAppPassword: appPassword,
      MicrosoftAppType: "MultiTenant",
    });

    const adapter = new CloudAdapter(botAuth);

    adapter.onTurnError = async (_context: TurnContext, error: Error) => {
      log.error(`Teams adapter error: ${error.message}`);
    };

    this.instances.set(appId, {
      appId,
      appPassword,
      adapter,
      conversationRefs: new Map(),
    });

    log.info(`Teams instance registered: appId=${appId}`);
    return appId;
  }

  async disconnect(appId: string): Promise<void> {
    this.instances.delete(appId);
    log.info(`Teams instance removed: appId=${appId}`);
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
    const instance =
      this.instances.get(target.appId ?? "") ??
      this.instances.values().next().value;
    if (!instance) {
      return { success: false, error: "No Teams instance configured" };
    }

    const convRef = instance.conversationRefs.get(target.channelId);
    if (!convRef) {
      return {
        success: false,
        error: `No conversation reference for ${target.channelId}`,
      };
    }

    try {
      let sentId: string | undefined;
      await instance.adapter.continueConversationAsync(
        instance.appId,
        convRef,
        async (context: TurnContext) => {
          const response = await context.sendActivity({
            type: ActivityTypes.Message,
            text: message.text,
          });
          sentId = response?.id;
        },
      );
      return { success: true, messageId: sentId };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`Failed to send to ${target.channelId}: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  async sendTyping(target: ChannelTarget): Promise<void> {
    const instance =
      this.instances.get(target.appId ?? "") ??
      this.instances.values().next().value;
    if (!instance) return;

    const convRef = instance.conversationRefs.get(target.channelId);
    if (!convRef) return;

    try {
      await instance.adapter.continueConversationAsync(
        instance.appId,
        convRef,
        async (context: TurnContext) => {
          await context.sendActivity({ type: ActivityTypes.Typing });
        },
      );
    } catch {
      // Best-effort
    }
  }

  // -- Activity handler -------------------------------------------------------

  private async handleActivity(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // Try each instance — the Bot Framework SDK validates the token internally
    for (const instance of this.instances.values()) {
      try {
        await instance.adapter.process(req as any, res as any, async (context: TurnContext) => {
          if (context.activity.type === ActivityTypes.Message) {
            // Store conversation reference for proactive messaging
            const convRef =
              TurnContext.getConversationReference(context.activity);
            const channelId = this.getChannelId(context.activity);
            instance.conversationRefs.set(channelId, convRef);

            const normalized = this.normalizeActivity(
              context.activity,
              instance.appId,
            );
            if (normalized) {
              this.onMessageHandler?.(normalized);
            }
          }
        });
        return; // Success — don't try other instances
      } catch {
        // Auth failed for this instance, try next
        continue;
      }
    }

    // No instance matched
    if (!res.headersSent) {
      res.writeHead(401);
      res.end("Unauthorized");
    }
  }

  private normalizeActivity(
    activity: Activity,
    appId: string,
  ): InboundMessage | null {
    // Skip bot's own messages
    if (activity.from?.id === appId) return null;

    const text = activity.text ?? "";
    if (!text && (!activity.attachments || activity.attachments.length === 0))
      return null;

    // Remove @mention of the bot from text
    const cleanText = this.removeBotMention(text, appId);

    const channelId = this.getChannelId(activity);

    let chatType: "direct" | "group" | "thread" = "direct";
    if (activity.conversation?.conversationType === "groupChat") {
      chatType = "group";
    } else if (activity.conversation?.conversationType === "channel") {
      chatType = "group";
    }

    return {
      id: activity.id ?? `teams_${Date.now()}`,
      platform: "teams",
      channelId,
      sender: {
        id: activity.from?.id ?? "unknown",
        displayName: activity.from?.name,
      },
      text: cleanText,
      timestamp: activity.timestamp
        ? new Date(activity.timestamp as unknown as string).getTime()
        : Date.now(),
      chatType,
      appId,
      raw: activity,
    };
  }

  private getChannelId(activity: Activity): string {
    return activity.conversation?.id ?? activity.channelId ?? "unknown";
  }

  private removeBotMention(text: string, _appId: string): string {
    // Teams prepends "<at>BotName</at> " to messages in group chats
    return text.replace(/<at>.*?<\/at>\s*/g, "").trim();
  }
}
