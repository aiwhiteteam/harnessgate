import { Bot } from "grammy";
import type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelContext,
  ChannelTarget,
  SendResult,
  OutboundMessage,
} from "@harnessgate/core";
import { createLogger } from "@harnessgate/core";
import { normalizeMessage } from "./normalize.js";

const log = createLogger("channel-telegram");

export class TelegramAdapter implements ChannelAdapter {
  readonly id = "telegram";
  readonly capabilities: ChannelCapabilities = {
    maxTextLength: 4096,
    supportsMarkdown: true,
    supportsThreads: true,
    supportsTypingIndicator: true,
    supportsAttachments: true,
  };

  private bot?: Bot;

  async start(ctx: ChannelContext): Promise<void> {
    const token = ctx.config.botToken as string;
    if (!token) {
      throw new Error("Telegram adapter requires botToken in channel config");
    }

    this.bot = new Bot(token);

    // Handle all text messages, photos, documents, voice, audio, video
    this.bot.on(["message", "edited_message"], (gramCtx) => {
      const msg = normalizeMessage(gramCtx);
      if (msg) ctx.onMessage(msg);
    });

    this.bot.catch((err) => {
      ctx.onError(err.error instanceof Error ? err.error : new Error(String(err.error)));
    });

    // Stop bot when signal fires
    ctx.signal.addEventListener("abort", () => {
      this.bot?.stop();
    }, { once: true });

    // Start polling
    await this.bot.init();
    log.info(`Telegram bot started: @${this.bot.botInfo.username}`);

    // bot.start() blocks — run in background
    this.bot.start({ onStart: () => {} });
  }

  async stop(): Promise<void> {
    this.bot?.stop();
    log.info("Telegram bot stopped");
  }

  async send(target: ChannelTarget, message: OutboundMessage): Promise<SendResult> {
    if (!this.bot) return { success: false, error: "Bot not started" };

    try {
      const opts: Record<string, unknown> = {};

      if (target.threadId) {
        opts.message_thread_id = Number(target.threadId);
      }
      if (target.replyToId) {
        opts.reply_to_message_id = Number(target.replyToId);
      }

      const sent = await this.bot.api.sendMessage(
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
    if (!this.bot) return;
    try {
      await this.bot.api.sendChatAction(Number(target.channelId), "typing");
    } catch {
      // Typing indicators are best-effort
    }
  }
}
