-- HarnessGate Supabase schema
-- Run this in your Supabase SQL editor.

-- Apps: each bot instance maps to a specific agent
create table apps (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  credentials jsonb not null default '{}',
  app_id text,
  agent_id text not null,
  environment_id text not null,
  is_active boolean default true
);

create index idx_apps_platform on apps(platform);
create index idx_apps_app_id on apps(app_id);

-- Users: internal user records
create table users (
  id uuid primary key default gen_random_uuid(),
  is_active boolean default true
);

-- Platform identities: link platform users to internal users
create table platform_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  platform text not null,
  platform_id text not null,
  unique(platform, platform_id)
);

create index idx_platform_identities_user_id on platform_identities(user_id);

-- Access control: which users can access which agents
create table user_agent_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  agent_id text not null,
  unique(user_id, agent_id)
);

create index idx_user_agent_access_user_id on user_agent_access(user_id);

-- Sessions: persistent session storage
create table sessions (
  key text primary key,
  provider_session_id text not null,
  platform text not null,
  channel_id text not null,
  thread_id text,
  user_id text,
  app_id text,
  created_at bigint not null,
  last_active_at bigint not null
);

create index idx_sessions_last_active on sessions(last_active_at);

-- Example: insert an app
-- insert into apps (platform, credentials, agent_id, environment_id)
-- values ('telegram', '{"botToken": "123:ABC"}', 'agent_01XXXX', 'env_01XXXX');

-- Example: insert a user + platform identity + agent access
-- insert into users (id) values ('00000000-0000-0000-0000-000000000001');
-- insert into platform_identities (user_id, platform, platform_id)
-- values ('00000000-0000-0000-0000-000000000001', 'telegram', '123456789');
-- insert into user_agent_access (user_id, agent_id)
-- values ('00000000-0000-0000-0000-000000000001', 'agent_01XXXX');
