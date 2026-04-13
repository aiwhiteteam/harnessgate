/**
 * Example: HarnessGate with Supabase for user auth and session persistence.
 *
 * Install:
 *   npm install @harnessgate/core @harnessgate/provider-claude @harnessgate/channel-web @supabase/supabase-js
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY      — your Anthropic API key
 *   SUPABASE_URL           — your Supabase project URL
 *   SUPABASE_SERVICE_KEY   — your Supabase service role key
 *
 * Supabase tables (run in SQL editor):
 *
 *   create table users (
 *     id uuid primary key default gen_random_uuid(),
 *     is_active boolean default true,
 *     default_agent_id text,
 *     default_environment_id text
 *   );
 *
 *   create table channel_identities (
 *     id uuid primary key default gen_random_uuid(),
 *     user_id uuid references users(id),
 *     channel text not null,
 *     platform_id text not null,
 *     unique(channel, platform_id)
 *   );
 *
 *   create table sessions (
 *     key text primary key,
 *     provider_session_id text not null,
 *     channel text not null,
 *     channel_id text not null,
 *     thread_id text,
 *     user_id text,
 *     created_at bigint not null,
 *     last_active_at bigint not null
 *   );
 *
 *   create index idx_sessions_last_active on sessions(last_active_at);
 */

import { Bridge, type SessionStore, type SessionEntry, type BridgeConfig } from "@harnessgate/core";
import { ClaudeProvider } from "@harnessgate/provider-claude";
import { WebAdapter } from "@harnessgate/channel-web";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

// --- Session Store ---

const sessionStore: SessionStore = {
  async get(key) {
    const { data } = await supabase
      .from("sessions")
      .select()
      .eq("key", key)
      .single();
    if (!data) return null;
    return {
      key: data.key,
      providerSessionId: data.provider_session_id,
      channel: data.channel,
      channelId: data.channel_id,
      threadId: data.thread_id ?? undefined,
      userId: data.user_id ?? undefined,
      createdAt: data.created_at,
      lastActiveAt: data.last_active_at,
    };
  },

  async set(key, entry) {
    await supabase.from("sessions").upsert({
      key,
      provider_session_id: entry.providerSessionId,
      channel: entry.channel,
      channel_id: entry.channelId,
      thread_id: entry.threadId ?? null,
      user_id: entry.userId ?? null,
      created_at: entry.createdAt,
      last_active_at: entry.lastActiveAt,
    });
  },

  async delete(key) {
    const { count } = await supabase
      .from("sessions")
      .delete({ count: "exact" })
      .eq("key", key);
    return (count ?? 0) > 0;
  },

  async touch(key) {
    await supabase
      .from("sessions")
      .update({ last_active_at: Date.now() })
      .eq("key", key);
  },
};

// --- Config ---

const config: BridgeConfig = {
  provider: { type: "claude" },
  channels: { web: { port: 3000 } },
};

// --- Bridge ---

const provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!);
const bridge = new Bridge(provider, config);

// Use Supabase for session persistence
bridge.setSessionStore(sessionStore);

// Use Supabase for user auth
bridge.setUserResolver(async (sender, channel, _message) => {
  // Look up platform identity → internal user
  const { data: identity } = await supabase
    .from("channel_identities")
    .select("user_id")
    .eq("channel", channel)
    .eq("platform_id", sender.id)
    .single();

  if (!identity) return null; // unknown user → reject

  // Fetch user details
  const { data: user } = await supabase
    .from("users")
    .select()
    .eq("id", identity.user_id)
    .single();

  if (!user?.is_active) return null; // inactive → reject

  return {
    userId: user.id,
    agentId: user.default_agent_id ?? undefined,
    environmentId: user.default_environment_id ?? undefined,
  };
});

bridge.addChannel(new WebAdapter());
await bridge.start();
console.log("HarnessGate + Supabase running — open http://localhost:3000");
