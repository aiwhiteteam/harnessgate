import type { SessionStore } from "harnessgate";
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

// --- Session Store ---

export const sessionStore: SessionStore = {
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
      platform: data.platform,
      channelId: data.channel_id,
      threadId: data.thread_id ?? undefined,
      userId: data.user_id ?? undefined,
      appId: data.app_id ?? undefined,
      createdAt: data.created_at,
      lastActiveAt: data.last_active_at,
    };
  },

  async set(key, entry) {
    await supabase.from("sessions").upsert({
      key,
      provider_session_id: entry.providerSessionId,
      platform: entry.platform,
      channel_id: entry.channelId,
      thread_id: entry.threadId ?? null,
      user_id: entry.userId ?? null,
      app_id: entry.appId ?? null,
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

// --- User Resolver (userId + appId → agent routing with access control) ---

export async function resolveUser(
  sender: { id: string },
  platform: string,
  appId?: string,
): Promise<{ userId: string; agentId?: string; environmentId?: string } | null> {
  // 1. Look up which app (bot instance) received this message
  if (!appId) {
    console.warn(`[auth] Rejected ${platform}:${sender.id} — no appId`);
    return null;
  }
  const { data: app } = await supabase
    .from("apps")
    .select("agent_id, environment_id")
    .eq("app_id", appId)
    .eq("is_active", true)
    .single();
  if (!app) {
    console.warn(`[auth] Rejected ${platform}:${sender.id} — unknown app ${appId}`);
    return null;
  }

  // 2. Look up platform identity → internal user
  const { data: identity } = await supabase
    .from("platform_identities")
    .select("user_id")
    .eq("platform", platform)
    .eq("platform_id", sender.id)
    .single();
  if (!identity) {
    console.warn(`[auth] Rejected ${platform}:${sender.id} — no platform identity`);
    return null;
  }

  // 3. Check user is active
  const { data: user } = await supabase
    .from("users")
    .select("id, is_active")
    .eq("id", identity.user_id)
    .single();
  if (!user?.is_active) {
    console.warn(`[auth] Rejected ${platform}:${sender.id} — user inactive or not found`);
    return null;
  }

  // 4. Check user has access to this agent
  const { data: access } = await supabase
    .from("user_agent_access")
    .select("id")
    .eq("user_id", user.id)
    .eq("agent_id", app.agent_id)
    .single();
  if (!access) {
    console.warn(`[auth] Rejected ${platform}:${sender.id} — no access to agent ${app.agent_id}`);
    return null;
  }

  return {
    userId: user.id,
    agentId: app.agent_id,
    environmentId: app.environment_id,
  };
}

// --- App Loader (fetch all active apps for a platform) ---

export async function getActiveApps(platform: string) {
  const { data, error } = await supabase
    .from("apps")
    .select("id, credentials, agent_id, environment_id")
    .eq("platform", platform)
    .eq("is_active", true);
  if (error) throw error;
  return data ?? [];
}
