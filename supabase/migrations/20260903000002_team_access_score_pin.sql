alter table public.team_access
  add column if not exists score_pin text;

alter table public.team_access
  drop constraint if exists team_access_score_pin_check;

alter table public.team_access
  add constraint team_access_score_pin_check check (score_pin is null or score_pin ~ '^\d{4}$');
