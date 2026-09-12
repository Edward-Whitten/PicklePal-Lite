-- Adds a first-class, queryable tournament lifecycle status column.
-- The column (not the public_state jsonb blob) is the source of truth for status.
alter table public.tournaments
  add column if not exists status text not null default 'setup';

alter table public.tournaments
  drop constraint if exists tournaments_status_check;

alter table public.tournaments
  add constraint tournaments_status_check check (status in ('setup', 'active', 'paused', 'completed'));

-- Preserve already-running tournaments: don't silently drop them back to 'setup'.
update public.tournaments
set status = 'active'
where status = 'setup'
  and coalesce((public_state->>'tournamentStarted')::boolean, false) = true;

create index if not exists tournaments_status_idx on public.tournaments (status);
