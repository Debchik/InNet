# Supabase setup for fact sync and exchanges

The application now persists fact groups in Supabase (optional per user) and records
QR exchanges so that one scan performs a two-way contact share. Configure the
following tables in your Supabase project before enabling the feature.

## Required environment variables

Set these variables for both the Next.js client and API routes:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The service role key is only used inside Next.js API routes and must **never**
be exposed to the browser.

## Email confirmations

Supabase can now handle account confirmation emails for you—no custom SMTP
code lives in the app anymore. New sign ups trigger an email automatically,
and users can resend it from the profile page via the Supabase client.

1. In the Supabase dashboard open **Authentication → Providers → Email** and
   enable *Confirm email*. This enforces the verification step before a user
   can sign in with email/password.
2. Still under **Authentication**, open **Settings → Email** and configure an SMTP
   provider (Resend, Mailgun, AWS SES, etc.). Fill out **Sender email**, host,
   port, username and password; Supabase will use these credentials to send the
   confirmation messages.
3. Set the project **Site URL** (Authentication → Settings → General) to the
   public origin of this app (e.g. `https://app.example.com`). Add the
   development URL (`https://localhost:3000`) to **Additional Redirect URLs**.
   The registration flow redirects to `/auth/callback`, so include
   `https://<your-domain>/auth/callback` (and the local equivalent) if you use
   strict allowlists.
4. Optionally customise the **Confirm signup** email template so the copy matches
   your branding. Only the body changes are required—the app handles the
   redirect link.

After these steps:

- The registration form calls `supabase.auth.signUp(...)` with a
  `emailRedirectTo` pointing at `/auth/callback`, so the user is routed back to
  the app after clicking the confirmation link.
- The profile page exposes an *Отправить письмо подтверждения* button that
  invokes `supabase.auth.resend({ type: 'signup', email })`.
- If Supabase is unreachable the UI continues to work locally, but the app
  surfaces a warning so you can revisit the SMTP setup.

## Tables

### `user_accounts`

Persists authenticated users, их профиль и план по умолчанию (`free`). Переход на модель
pay-as-you-go не отменяет таблицу: мы по-прежнему храним идентификаторы пользователей,
чтобы можно было синхронизировать данные между устройствами.

```sql
create table if not exists public.user_accounts (
  id uuid primary key,
  email text not null unique,
  phone text unique,
  password_hash text not null,
  plan text not null default 'free',
  plan_activated_at timestamptz,
  supabase_uid text,
  data jsonb not null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Recommended indexes and policies:

- `create index if not exists user_accounts_phone_idx on public.user_accounts (phone) where phone is not null;`
- If you use Supabase RLS, allow the service role to select/insert/update rows
  (`auth.role() = 'service_role'`). No other roles should have direct access.

Notes:

- The `plan` column остаётся для обратной совместимости. Сейчас все пользователи находятся
  на `free`, а токены списываются локально. После подключения YooKassa потребуется добавить
  `token_balance integer not null default 0` и синхронизировать пополнения из вебхуков.
- `data` содержит сериализованный `UserAccount` без пароля. Раньше мы добавляли туда
  `planProduct`/`planExpiresAt`; поля можно оставить (они не используются), чтобы не ломать
  старые клиенты.

### `fact_collections`

Stores the latest snapshot of a user's fact groups plus a toggle indicating
whether cross-device sync is enabled.

```sql
create table if not exists public.fact_collections (
  profile_id text primary key,
  groups jsonb not null default '[]'::jsonb,
  sync_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
```

Recommended policies (if row-level security is enabled):

- Allow read/write for the service-role (`auth.role() = 'service_role'`).
- Optionally expose read access to authenticated users keyed by `profile_id`
  if you plan to move away from the service role.

### `fact_exchanges`

Captures reciprocal share payloads so that the QR owner receives the scanner's
facts without a second scan.

```sql
create table if not exists public.fact_exchanges (
  id uuid primary key default gen_random_uuid(),
  initiator_profile_id text not null,
  target_profile_id text not null,
  payload jsonb not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
```

Create indexes to keep lookups fast:

```sql
create index if not exists fact_exchanges_target_idx
  on public.fact_exchanges (target_profile_id)
  where consumed_at is null;
```

Row-level security policies should at minimum allow the service role to
`insert` and `select` rows. Exchanges are marked as delivered by setting
`consumed_at` and `status = 'delivered'`.

## API endpoints

- `POST /api/account/register` – persist a new local password account in Supabase.
- `POST /api/account/login` – validate credentials (email or phone) against Supabase.
- `PUT /api/account/update` – sync profile/contact/subscription updates to Supabase.
- `GET /api/facts?profileId=...` – fetch fact groups + sync flag for a profile.
- `PUT /api/facts` – upsert fact groups and toggle sync (service role only).
- `GET /api/exchange?profileId=...` – pull pending exchanges for the QR owner.
- `POST /api/exchange` – store a reciprocal payload after scanning.

Both routes gracefully fall back when Supabase is not configured, but the sync
toggle and automatic two-way exchange require the tables above to exist.

### `share_links`

Maps compact slugs to the full QR payload so that every QR code encodes a short,
camera-friendly URL. Each entry expires automatically to keep the table small.

```sql
create table if not exists public.share_links (
  slug text primary key,
  token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists share_links_token_idx on public.share_links (token);
create index if not exists share_links_exp_idx on public.share_links (expires_at);
```

Add a scheduled job (or Supabase's automatic row expirer) that deletes rows
where `expires_at < now()` so expired slugs do not accumulate.

## API endpoints

- `POST /api/account/register` – persist a new local password account in Supabase.
- `POST /api/account/login` – validate credentials (email or phone) against Supabase.
- `PUT /api/account/update` – sync profile/contact/subscription updates to Supabase.
- `GET /api/facts?profileId=...` – fetch fact groups + sync flag for a profile.
- `PUT /api/facts` – upsert fact groups and toggle sync (service role only).
- `GET /api/exchange?profileId=...` – pull pending exchanges for the QR owner.
- `POST /api/exchange` – store a reciprocal payload after scanning.
- `POST /api/share-link` – create or reuse a short slug for the current QR payload.
- `GET /api/share-link?slug=...` – resolve a slug back into the full share token.
