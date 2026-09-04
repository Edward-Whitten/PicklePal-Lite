alter table public.tournaments drop constraint if exists tournaments_code_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tournaments_code_event_type_key'
  ) then
    alter table public.tournaments add constraint tournaments_code_event_type_key unique (code, event_type);
  end if;
end $$;