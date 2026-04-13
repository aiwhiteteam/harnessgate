import { Bot } from "grammy";
import type {
  PlatformAdapter,
  PlatformCapabilities,
  PlatformContext,
  ChannelTarget,
  SendResult,
  OutboundMessage,
} from "@harnessgate/core";
import { createLogger } from "@harnessgate/core";
import { normalizeMessage } from "./normalize.js";

const log = createLogger("platform-telegram");

/** A running bot instance. */
interface BotInstance {
  bot: Bot;
  appId: string;
}

export class TelegramAdapter implements PlatformAdapter {
  readonly id = "telegram";
  readonly capabilities: PlatformCapabilities = {
    maxTextLength: 4096,
    supportsMarkdown: true,
    supportsThreads: true,
    supportsTypingIndicator: true,
    supportsAttachments: true,
  };

  /** Running bot instances keyed by appId (platform-assigned bot ID). */
  private bots = new Map<string, BotInstance>();

  /**
   * Start a single bot from platform config (backwards-compatible).
   * For multi-instance, use addApp() instead.
   */
  async start(ctx: PlatformContext): Promise<void> {
    const token = ctx.config.botToken as string;
    if (!token) {
      throw new Error("Telegram adapter requires botToken in platform config");
    }

    await this.addApp({ botToken: token }, ctx);
  }

  async addApp(config: Record<string, unknown>, ctx: PlatformContext): Promise<string> {
    const token = config.botToken as string;
    if (!token) {
      throw new Error("Telegram addApp requires botToken in config");
    }

    const bot = new Bot(token);

    // Connect to get the bot's platform-assigned identity
    await bot.init();
    const appId = String(bot.botInfo.id);

    // Wire up message handling with appId
    bot.on(["message", "edited_message"], (gramCtx) => {
      const msg = normalizeMessage(gramCtx, appId);
      if (msg) ctx.onMessage(msg);
    });

    bot.catch((err) => {
      ctx.onError(err.error instanceof Error ? err.error : new Error(String(err.error)));
    });

    ctx.signal.addEventListener("abort", () => {
      bot.stop();
    }, { once: true });

    log.info(`Telegram bot started: @${bot.botInfo.username} (appId=${appId})`);

    // bot.start() blocks — run in background
    bot.start({ onStart: () => {} });

    this.bots.set(appId, { bot, appId });
    return appId;
  }

  async removeApp(appId: string): Promise<void> {
    const instance = this.bots.get(appId);
    if (!instance) return;

    instance.bot.stop();
    this.bots.delete(appId);
    log.info(`Telegram bot stopped: appId=${appId}`);
  }

  activeApps(): string[] {
    return Array.from(this.bots.keys());
  }

  async stop(): Promise<void> {
    for (const instance of this.bots.values()) {
      instance.bot.stop();
    }
    this.bots.clear();
    log.info("Telegram adapter stopped");
  }

  async send(target: ChannelTarget, message: OutboundMessage): Promise<SendResult> {
    // Find the right bot instance to send from
    const instance = target.appId
      ? this.bots.get(target.appId)
      : this.bots.values().next().value;

    if (!instance) return { success: false, error: "No bot instance available" };

    try {
      const opts: Record<string, unknown> = {};

      if (target.threadId) {
        opts.message_thread_id = Number(target.threadId);
      }
      if (target.replyToId) {
        opts.reply_to_message_id = Number(target.replyToId);
      }

      const sent = await instance.bot.api.sendMessage(
        Number(target.channelId),
        message.text,
        opts,
      );

      return { success: true, messageId: String(sent.message_id) };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`Failed to send to ${target.channelId}: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  async sendTyping(target: ChannelTarget): Promise<void> {
    const instance = target.appId
      ? this.bots.get(target.appId)
      : this.bots.values().next().value;

    if (!instance) return;

    try {
      await instance.bot.api.sendChatAction(Number(target.channelId), "typing");
    } catch {
      // Typing indicators are best-effort
    }
  }
}
