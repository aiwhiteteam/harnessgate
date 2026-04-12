import { createHmac } from "node:crypto";
import type { Sender } from "./messages.js";
import type { UserResolver, ResolvedUser } from "./provider.js";
import { createLogger } from "./logger.js";

const log = createLogger("webhook-auth");

interface WebhookResponse {
  allowed: boolean;
  userId?: string;
  agentId?: string;
  environmentId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Creates a UserResolver that validates users via an external webhook.
 *
 * The bridge POSTs to the webhook URL with the sender info.
 * The webhook returns { allowed: true, userId, agentId?, ... } or { allowed: false }.
 *
 * If a secret is provided, the request body is signed with HMAC-SHA256
 * in the X-HarnessGate-Signature header.
 */
export function createWebhookResolver(
  webhookUrl: string,
  secret?: string,
): UserResolver {
  return async (sender: Sender, channel: string): Promise<ResolvedUser | null> => {
    const body = JSON.stringify({
      channel,
      senderId: sender.id,
      senderUsername: sender.username,
      senderDisplayName: sender.displayName,
    });

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (secret) {
      const signature = createHmac("sha256", secret)
        .update(body)
        .digest("hex");
      headers["x-harnessgate-signature"] = signature;
    }

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body,
      });

      if (!res.ok) {
        log.warn(`Auth webhook returned ${res.status}`);
        return null;
      }

      const data = (await res.json()) as WebhookResponse;

      if (!data.allowed) {
        return null;
      }

      return {
        userId: data.userId ?? sender.id,
        agentId: data.agentId,
        environmentId: data.environmentId,
        metadata: data.metadata,
      };
    } catch (err) {
      log.error(`Auth webhook error: ${webhookUrl}`, err);
      return null;
    }
  };
}
