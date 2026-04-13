# HarnessGate + Supabase Starter

Ready-to-deploy gateway connecting Claude Managed Agents to messaging platforms with Supabase for user auth and session persistence.

## Setup

### 1. Copy this directory

```bash
cp -r examples/supabase my-app
cd my-app
```

### 2. Create Supabase tables

Run in your Supabase SQL editor:

```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  is_active boolean default true,
  default_agent_id text,
  default_environment_id text
);

create table channel_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  channel text not null,
  platform_id text not null,
  unique(channel, platform_id)
);

create table sessions (
  key text primary key,
  provider_session_id text not null,
  channel text not null,
  channel_id text not null,
  thread_id text,
  user_id text,
  created_at bigint not null,
  last_active_at bigint not null
);
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your keys
```

### 4. Install and run

```bash
npm install
npm run build
npm start
```

Open http://localhost:3000 to chat via the Web UI.

## Adding channels

```typescript
import { TelegramAdapter } from "@harnessgate/channel-telegram";

bridge.addChannel(new TelegramAdapter());
```

Add channel config to the `BridgeConfig.channels` object in `src/main.ts`:

```typescript
channels: {
  web: { port: 3000 },
  telegram: { botToken: process.env.TELEGRAM_BOT_TOKEN },
},
```
