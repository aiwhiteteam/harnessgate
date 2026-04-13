import pkg from "@slack/bolt";
const { App } = pkg;
import type {
  PlatformAdapter,
  PlatformCapabilities,
  PlatformContext,
  ChannelTarget,
  SendResult,
  OutboundMessage,
} from "@harnessgate/core";
import { createLogger } from "@harnessgate/core";
import { normalizeMessage, type SlackMessageEvent } from "./normalize.js";

const log = createLogger("platform-slack");

export class SlackAdapter implements PlatformAdapter {
  readonly id = "slack";
  readonly capabilities: PlatformCapabilities = {
    maxTextLength: 4000,
    supportsMarkdown: true,
    supportsThreads: true,
    supportsTypingIndicator: false,
    supportsAttachments: true,
  };

  private app?: InstanceType<typeof App>;

  async start(ctx: PlatformContext): Promise<void> {
    const botToken = ctx.config.botToken as string;
    const appToken = ctx.config.appToken as string;

    if (!botToken || !appToken) {
      throw new Error("Slack adapter requires botToken and appToken in channel config");
    }

    this.app = new App({
      token: botToken,
      appToken,
      socketMode: true,
    });

    this.app.message(async ({ event }) => {
      // Ignore bot messages
      if ((event as { bot_id?: string }).bot_id) return;

      const msg = normalizeMessage(event as SlackMessageEvent);
      if (msg) ctx.onMessage(msg);
    });

    this.app.error(async (error) => {
      ctx.onError(error instanceof Error ? error : new Error(String(error)));
    });

    ctx.signal.addEventListener("abort", () => {
      this.app?.stop().catch(() => {});
    }, { once: true });

    await this.app.start();
    log.info("Slack bot started (socket mode)");
  }

  async stop(): Promise<void> {
    await this.app?.stop();
    log.info("Slack bot stopped");
  }

  async send(target: ChannelTarget, message: OutboundMessage): Promise<SendResult> {
    if (!this.app) return { success: false, error: "App not started" };

    try {
      const result = await this.app.client.chat.postMessage({
        channel: target.channelId,
        text: message.text,
        thread_ts: target.threadId,
      });
      return { success: true, messageId: result.ts as string };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`Failed to send to ${target.channelId}: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }
}
