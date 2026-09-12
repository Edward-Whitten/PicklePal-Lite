-- Supports multiple authorized manager PINs per tournament (co-managers).
-- Hashes only -- plaintext PINs are never stored, matching admin_pin_hash's existing model.
alter table public.tournaments
  add column if not exists manager_pin_hashes text[] not null default '{}'::text[];

-- Backfill: fold each tournament's existing single admin PIN hash into the array
-- so no current manager loses access when the array-based check goes live.
update public.tournaments
set manager_pin_hashes = array[admin_pin_hash]
where coalesce(array_length(manager_pin_hashes, 1), 0) = 0
  and admin_pin_hash is not null;
