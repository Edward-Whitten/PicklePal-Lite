insert into public.tournaments (code, event_type, display_name, admin_pin_hash, manager_pin_hashes, public_state, status)
values (
  'test',
  'tournament',
  'Dry Run Simulation',
  encode(digest('1234', 'sha256'), 'hex'),
  array[encode(digest('1234', 'sha256'), 'hex')],
  '{}'::jsonb,
  'setup'
)
on conflict (code, event_type) do update
set admin_pin_hash = excluded.admin_pin_hash,
    manager_pin_hashes = excluded.manager_pin_hashes,
    status = 'setup';
