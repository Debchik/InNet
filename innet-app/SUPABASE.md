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

## Tables

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

- `GET /api/facts?profileId=...` – fetch fact groups + sync flag for a profile.
- `PUT /api/facts` – upsert fact groups and toggle sync (service role only).
- `GET /api/exchange?profileId=...` – pull pending exchanges for the QR owner.
- `POST /api/exchange` – store a reciprocal payload after scanning.

Both routes gracefully fall back when Supabase is not configured, but the sync
toggle and automatic two-way exchange require the tables above to exist.
