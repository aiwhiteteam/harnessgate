import {
  Client,
  GatewayIntentBits,
  Partials,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import type {
  PlatformAdapter,
  PlatformCapabilities,
  PlatformContext,
  ChannelTarget,
  SendResult,
  OutboundMessage,
} from "../index.js";
import { createLogger } from "../index.js";
import { normalizeMessage } from "./discord-normalize.js";

const log = createLogger("platform-discord");

export class DiscordAdapter implements PlatformAdapter {
  readonly id = "discord";
  readonly capabilities: PlatformCapabilities = {
    maxTextLength: 2000,
    supportsMarkdown: true,
    supportsThreads: true,
    supportsTypingIndicator: true,
    supportsAttachments: true,
  };

  private client?: Client;

  async start(ctx: PlatformContext): Promise<void> {
    const token = ctx.config.token as string;
    if (!token) {
      throw new Error("Discord adapter requires token in platform config");
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel, Partials.Message],
    });

    this.client.on("messageCreate", (msg: Message) => {
      const normalized = normalizeMessage(msg);
      if (normalized) ctx.onMessage(normalized);
    });

    this.client.on("error", (err: Error) => {
      ctx.onError(err);
    });

    ctx.signal.addEventListener("abort", () => {
      this.client?.destroy();
    }, { once: true });

    await this.client.login(token);
    log.info(`Discord bot started: ${this.client.user?.tag}`);
  }

  async stop(): Promise<void> {
    this.client?.destroy();
    log.info("Discord bot stopped");
  }

  async send(target: ChannelTarget, message: OutboundMessage): Promise<SendResult> {
    if (!this.client) return { success: false, error: "Client not started" };

    try {
      const channel = await this.client.channels.fetch(target.channelId) as TextBasedChannel | null;
      if (!channel || !("send" in channel)) {
        return { success: false, error: `Channel ${target.channelId} not found or not text-based` };
      }

      const opts: Record<string, unknown> = {};
      if (target.replyToId) {
        opts.reply = { messageReference: target.replyToId };
      }

      const sent = await channel.send({ content: message.text, ...opts });
      return { success: true, messageId: sent.id };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`Failed to send to ${target.channelId}: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  async sendTyping(target: ChannelTarget): Promise<void> {
    if (!this.client) return;
    try {
      const channel = await this.client.channels.fetch(target.channelId) as TextBasedChannel | null;
      if (channel && "sendTyping" in channel) {
        await channel.sendTyping();
      }
    } catch {
      // Best-effort
    }
  }
}
