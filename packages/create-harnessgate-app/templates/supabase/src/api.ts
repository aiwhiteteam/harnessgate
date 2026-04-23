import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "./supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VALID_PLATFORMS = ["telegram", "discord", "slack", "web"];
const MAX_BODY_SIZE = 1024 * 1024; // 1MB

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function fail(res: http.ServerResponse, status: number, message: string): void {
  json(res, status, { error: message });
}

async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_SIZE) throw new Error("Payload too large");
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString();
  if (!raw) return {};
  return JSON.parse(raw);
}

function segments(url: string): string[] {
  return url.split("?")[0].split("/").filter(Boolean);
}

function requireString(body: Record<string, unknown>, field: string): string | null {
  const val = body[field];
  if (typeof val === "string" && val.length > 0) return val;
  return null;
}

function checkAuth(req: http.IncomingMessage): boolean {
  const key = process.env.ADMIN_API_KEY;
  if (!key) return true; // no key configured = open (dev mode)
  const header = req.headers.authorization;
  return header === `Bearer ${key}`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const method = req.method ?? "GET";
  const parts = segments(req.url ?? "/");

  if (parts[0] !== "api") {
    fail(res, 404, "Not found");
    return;
  }

  const resource = parts[1];

  // --- Public routes (no auth) ---

  // GET /api/openapi.json
  if (resource === "openapi.json" && method === "GET") {
    const specPath = path.resolve(__dirname, "..", "openapi.json");
    const spec = fs.readFileSync(specPath, "utf-8");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(spec);
    return;
  }

  // GET /api/docs
  if (resource === "docs" && method === "GET") {
    const html = `<!doctype html>
<html>
<head>
  <title>HarnessGate Admin API</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <script id="api-reference" data-url="/api/openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
    return;
  }

  // --- Auth required for all routes below ---

  if (!checkAuth(req)) {
    fail(res, 401, "Unauthorized");
    return;
  }

  // -------------------------------------------------------------------------
  // Apps
  // -------------------------------------------------------------------------
  if (resource === "apps") {
    const appId = parts[2];

    // POST /api/apps
    if (method === "POST" && !appId) {
      const body = await readBody(req);
      const platform = requireString(body, "platform");
      const agent_id = requireString(body, "agent_id");
      const environment_id = requireString(body, "environment_id");
      if (!platform || !VALID_PLATFORMS.includes(platform)) {
        fail(res, 400, `platform is required and must be one of: ${VALID_PLATFORMS.join(", ")}`);
        return;
      }
      if (!agent_id) { fail(res, 400, "agent_id is required"); return; }
      if (!environment_id) { fail(res, 400, "environment_id is required"); return; }

      const { data, error: err } = await supabase
        .from("apps")
        .insert({ platform, credentials: body.credentials ?? {}, agent_id, environment_id })
        .select()
        .single();
      if (err) { console.error("POST /api/apps error:", err); fail(res, 400, "Failed to create app"); return; }
      json(res, 201, data);
      return;
    }

    // GET /api/apps
    if (method === "GET" && !appId) {
      const { data, error: err } = await supabase.from("apps").select().order("platform");
      if (err) { console.error("GET /api/apps error:", err); fail(res, 500, "Failed to list apps"); return; }
      json(res, 200, data);
      return;
    }

    // GET /api/apps/:id
    if (method === "GET" && appId) {
      const { data, error: err } = await supabase.from("apps").select().eq("id", appId).single();
      if (err) { fail(res, 404, "App not found"); return; }
      json(res, 200, data);
      return;
    }

    // PATCH /api/apps/:id
    if (method === "PATCH" && appId) {
      const body = await readBody(req);
      if (body.platform && !VALID_PLATFORMS.includes(body.platform as string)) {
        fail(res, 400, `platform must be one of: ${VALID_PLATFORMS.join(", ")}`);
        return;
      }
      const { data, error: err } = await supabase.from("apps").update(body).eq("id", appId).select().single();
      if (err) { console.error("PATCH /api/apps error:", err); fail(res, 400, "Failed to update app"); return; }
      json(res, 200, data);
      return;
    }

    // DELETE /api/apps/:id
    if (method === "DELETE" && appId) {
      const { data, error: err } = await supabase.from("apps").update({ is_active: false }).eq("id", appId).select().single();
      if (err) { fail(res, 404, "App not found"); return; }
      json(res, 200, data);
      return;
    }
  }

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------
  if (resource === "users") {
    const userId = parts[2];
    const subResource = parts[3];

    // --- Platform Identities ---
    if (userId && subResource === "identities") {
      const identityId = parts[4];

      // POST /api/users/:id/identities
      if (method === "POST" && !identityId) {
        const body = await readBody(req);
        const platform = requireString(body, "platform");
        const platform_id = requireString(body, "platform_id");
        if (!platform || !VALID_PLATFORMS.includes(platform)) {
          fail(res, 400, `platform is required and must be one of: ${VALID_PLATFORMS.join(", ")}`);
          return;
        }
        if (!platform_id) { fail(res, 400, "platform_id is required"); return; }

        const { data, error: err } = await supabase
          .from("platform_identities")
          .insert({ user_id: userId, platform, platform_id })
          .select()
          .single();
        if (err) { console.error("POST identity error:", err); fail(res, 400, "Failed to create identity"); return; }
        json(res, 201, data);
        return;
      }

      // DELETE /api/users/:id/identities/:identityId
      if (method === "DELETE" && identityId) {
        const { error: err } = await supabase
          .from("platform_identities")
          .delete()
          .eq("id", identityId)
          .eq("user_id", userId);
        if (err) { console.error("DELETE identity error:", err); fail(res, 400, "Failed to delete identity"); return; }
        json(res, 200, { deleted: true });
        return;
      }
    }

    // --- Access Control ---
    if (userId && subResource === "access") {
      const agentId = parts[4];

      // POST /api/users/:id/access
      if (method === "POST" && !agentId) {
        const body = await readBody(req);
        const agent_id = requireString(body, "agent_id");
        if (!agent_id) { fail(res, 400, "agent_id is required"); return; }

        const { data, error: err } = await supabase
          .from("user_agent_access")
          .insert({ user_id: userId, agent_id })
          .select()
          .single();
        if (err) { console.error("POST access error:", err); fail(res, 400, "Failed to grant access"); return; }
        json(res, 201, data);
        return;
      }

      // DELETE /api/users/:id/access/:agentId
      if (method === "DELETE" && agentId) {
        const { error: err } = await supabase
          .from("user_agent_access")
          .delete()
          .eq("user_id", userId)
          .eq("agent_id", agentId);
        if (err) { console.error("DELETE access error:", err); fail(res, 400, "Failed to revoke access"); return; }
        json(res, 200, { deleted: true });
        return;
      }
    }

    // --- Users CRUD ---

    // POST /api/users
    if (method === "POST" && !userId) {
      const body = await readBody(req);
      const { data, error: err } = await supabase
        .from("users")
        .insert({ is_active: body.is_active ?? true })
        .select()
        .single();
      if (err) { console.error("POST /api/users error:", err); fail(res, 400, "Failed to create user"); return; }
      json(res, 201, data);
      return;
    }

    // GET /api/users
    if (method === "GET" && !userId) {
      const { data, error: err } = await supabase
        .from("users")
        .select("*, platform_identities (*), user_agent_access (*)");
      if (err) { console.error("GET /api/users error:", err); fail(res, 500, "Failed to list users"); return; }
      json(res, 200, data);
      return;
    }

    // GET /api/users/:id
    if (method === "GET" && userId && !subResource) {
      const { data, error: err } = await supabase
        .from("users")
        .select("*, platform_identities (*), user_agent_access (*)")
        .eq("id", userId)
        .single();
      if (err) { fail(res, 404, "User not found"); return; }
      json(res, 200, data);
      return;
    }

    // PATCH /api/users/:id
    if (method === "PATCH" && userId && !subResource) {
      const body = await readBody(req);
      const { data, error: err } = await supabase.from("users").update(body).eq("id", userId).select().single();
      if (err) { console.error("PATCH /api/users error:", err); fail(res, 400, "Failed to update user"); return; }
      json(res, 200, data);
      return;
    }

    // DELETE /api/users/:id
    if (method === "DELETE" && userId && !subResource) {
      const { data, error: err } = await supabase.from("users").update({ is_active: false }).eq("id", userId).select().single();
      if (err) { fail(res, 404, "User not found"); return; }
      json(res, 200, data);
      return;
    }
  }

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------
  if (resource === "sessions") {
    const sessionKey = parts[2] ? decodeURIComponent(parts.slice(2).join("/")) : undefined;

    // GET /api/sessions
    if (method === "GET" && !sessionKey) {
      const { data, error: err } = await supabase.from("sessions").select().order("last_active_at", { ascending: false });
      if (err) { console.error("GET /api/sessions error:", err); fail(res, 500, "Failed to list sessions"); return; }
      json(res, 200, data);
      return;
    }

    // DELETE /api/sessions/:key
    if (method === "DELETE" && sessionKey) {
      const { error: err } = await supabase.from("sessions").delete().eq("key", sessionKey);
      if (err) { console.error("DELETE session error:", err); fail(res, 400, "Failed to delete session"); return; }
      json(res, 200, { deleted: true });
      return;
    }
  }

  fail(res, 404, "Not found");
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export function startAdminApi(port: number): void {
  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res);
    } catch (err) {
      console.error("Admin API error:", err);
      fail(res, 500, "Internal server error");
    }
  });

  server.listen(port, () => {
    const secured = process.env.ADMIN_API_KEY ? " (API key required)" : " (no API key — open access)";
    console.log(`Admin API listening on http://localhost:${port}${secured}`);
  });
}
