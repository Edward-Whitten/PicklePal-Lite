alter table public.tournaments
  add column if not exists event_type text not null default 'tournament';

alter table public.tournaments
  drop constraint if exists tournaments_event_type_check;

alter table public.tournaments
  add constraint tournaments_event_type_check check (event_type in ('tournament', 'round_robin'));

create index if not exists tournaments_event_type_idx on public.tournaments (event_type, code);
