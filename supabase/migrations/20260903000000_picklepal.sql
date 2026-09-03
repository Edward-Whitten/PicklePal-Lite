create extension if not exists pgcrypto;

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]{1,48}$'),
  event_type text not null default 'tournament' check (event_type in ('tournament', 'round_robin')),
  display_name text not null,
  admin_pin_hash text not null,
  public_state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.team_access (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  team_id text not null,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  unique (tournament_id, team_id),
  unique (tournament_id, pin_hash)
);

create table if not exists public.score_reports (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_id text not null,
  team_id text not null,
  team_a_score integer not null check (team_a_score >= 0),
  team_b_score integer not null check (team_b_score >= 0),
  submitted_at timestamptz not null default now(),
  unique (tournament_id, match_id, team_id)
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  actor_role text not null check (actor_role in ('admin', 'player', 'system')),
  actor_id text,
  event_type text not null,
  match_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.tournaments enable row level security;
alter table public.team_access enable row level security;
alter table public.score_reports enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.tournaments, public.team_access, public.score_reports, public.audit_events from anon, authenticated;
grant select on public.tournaments to anon, authenticated;

drop policy if exists "Public can view tournament state" on public.tournaments;
create policy "Public can view tournament state"
on public.tournaments for select
to anon, authenticated
using (true);

alter publication supabase_realtime add table public.tournaments;

create index if not exists tournaments_event_type_idx on public.tournaments (event_type, code);

create index if not exists score_reports_match_idx on public.score_reports (tournament_id, match_id);
create index if not exists audit_events_tournament_idx on public.audit_events (tournament_id, created_at desc);
