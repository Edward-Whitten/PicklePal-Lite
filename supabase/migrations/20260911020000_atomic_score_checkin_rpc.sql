-- Atomic score-report and check-in RPCs to eliminate read-modify-write races under concurrent load.
-- Both functions lock the tournament row (SELECT ... FOR UPDATE) and perform the merge + write in the
-- SAME transaction, so concurrent calls for the same tournament serialize instead of clobbering each other.

create or replace function public.submit_score_report(
  p_tournament_id uuid,
  p_team_id text,
  p_match_id text,
  p_team_a_id text,
  p_team_b_id text,
  p_team_a_score int,
  p_team_b_score int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb;
  v_reports jsonb;
  v_completed jsonb;
  v_report jsonb;
  v_other jsonb;
  v_report_key text;
  v_other_key text;
  v_confirmed boolean := false;
  v_teams jsonb;
  v_team_ids text[];
  v_now_iso text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if p_team_a_score = p_team_b_score then
    raise exception 'A valid non-tied score is required.';
  end if;
  if p_team_id <> p_team_a_id and p_team_id <> p_team_b_id then
    raise exception 'Unauthorized: This code does not match your registered team.';
  end if;

  select public_state into v_state from public.tournaments where id = p_tournament_id for update;
  if v_state is null then
    raise exception 'Tournament not found.';
  end if;

  v_teams := coalesce(v_state->'teams', '[]'::jsonb);
  select array_agg(t->>'id') into v_team_ids from jsonb_array_elements(v_teams) as t;
  if not (p_team_a_id = any(v_team_ids)) or not (p_team_b_id = any(v_team_ids)) then
    raise exception 'This match is not part of the tournament.';
  end if;

  v_reports := coalesce(v_state->'scoreReports', '{}'::jsonb);
  v_completed := coalesce(v_state->'completedMatches', '{}'::jsonb);

  v_report_key := case when p_team_id = p_team_a_id then 'teamA' else 'teamB' end;
  v_other_key := case when v_report_key = 'teamA' then 'teamB' else 'teamA' end;

  v_report := coalesce(v_reports->p_match_id, '{}'::jsonb);
  v_report := jsonb_set(v_report, array[v_report_key], jsonb_build_object(
    's1', p_team_a_score, 's2', p_team_b_score, 'submittedAt', v_now_iso, 'teamId', p_team_id
  ), true);
  v_reports := jsonb_set(v_reports, array[p_match_id], v_report, true);

  v_other := v_report->v_other_key;
  if v_other is not null
     and (v_other->>'s1')::int = p_team_a_score
     and (v_other->>'s2')::int = p_team_b_score
     and not (v_completed ? p_match_id) then
    v_completed := jsonb_set(v_completed, array[p_match_id], jsonb_build_object(
      's1', p_team_a_score, 's2', p_team_b_score, 'teamAId', p_team_a_id, 'teamBId', p_team_b_id,
      'status', 'confirmed', 'resolvedBy', 'teams', 'resolvedAt', v_now_iso
    ), true);
    v_reports := v_reports - p_match_id;
    v_confirmed := true;
  end if;

  v_state := jsonb_set(v_state, '{scoreReports}', v_reports, true);
  v_state := jsonb_set(v_state, '{completedMatches}', v_completed, true);
  v_state := jsonb_set(v_state, '{updatedAt}', to_jsonb(round(extract(epoch from now()) * 1000)), true);

  -- Recompute every team's wins/losses/pf/pa/pd from completedMatches (mirrors recomputePoolStats()).
  with match_rows as (
    select value as m
    from jsonb_each(v_completed)
    where (value->>'s1') ~ '^[0-9]+$' and (value->>'s2') ~ '^[0-9]+$'
      and (value->>'teamAId') is not null and (value->>'teamBId') is not null
  ),
  per_team as (
    select (m->>'teamAId') as team_id,
           case when (m->>'s1')::int > (m->>'s2')::int then 1 else 0 end as win,
           case when (m->>'s1')::int > (m->>'s2')::int then 0 else 1 end as loss,
           (m->>'s1')::int as pf, (m->>'s2')::int as pa
    from match_rows
    union all
    select (m->>'teamBId') as team_id,
           case when (m->>'s2')::int > (m->>'s1')::int then 1 else 0 end as win,
           case when (m->>'s2')::int > (m->>'s1')::int then 0 else 1 end as loss,
           (m->>'s2')::int as pf, (m->>'s1')::int as pa
    from match_rows
  ),
  agg as (
    select team_id, sum(win) as wins, sum(loss) as losses, sum(pf) as pf, sum(pa) as pa, sum(pf - pa) as pd
    from per_team group by team_id
  )
  select jsonb_agg(
    (t.elem - 'wins' - 'losses' - 'pf' - 'pa' - 'pd') || jsonb_build_object(
      'wins', coalesce(a.wins, 0), 'losses', coalesce(a.losses, 0),
      'pf', coalesce(a.pf, 0), 'pa', coalesce(a.pa, 0), 'pd', coalesce(a.pd, 0)
    )
  )
  into v_teams
  from jsonb_array_elements(v_teams) as t(elem)
  left join agg a on a.team_id = (t.elem->>'id');

  v_state := jsonb_set(v_state, '{teams}', coalesce(v_teams, '[]'::jsonb), true);

  update public.tournaments set public_state = v_state, updated_at = now() where id = p_tournament_id;

  return jsonb_build_object('confirmed', v_confirmed, 'state', v_state);
end;
$$;

create or replace function public.check_in_player(
  p_tournament_id uuid,
  p_team_id text,
  p_player_slot text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb;
  v_teams jsonb;
  v_team jsonb;
  v_idx int;
  v_checked_in boolean;
begin
  if p_player_slot not in ('p1', 'p2') then
    raise exception 'Use individual player check-in before scoring.';
  end if;

  select public_state into v_state from public.tournaments where id = p_tournament_id for update;
  if v_state is null then
    raise exception 'Tournament not found.';
  end if;

  v_teams := coalesce(v_state->'teams', '[]'::jsonb);
  select ord.i - 1 into v_idx
  from jsonb_array_elements(v_teams) with ordinality as ord(t, i)
  where (ord.t->>'id') = p_team_id
  limit 1;

  if v_idx is null then
    raise exception 'This team is not part of the tournament.';
  end if;

  v_team := v_teams->v_idx;
  v_team := jsonb_set(v_team, array[p_player_slot || 'CheckedIn'], 'true'::jsonb, true);
  v_checked_in := coalesce((v_team->>'p1CheckedIn')::boolean, false) and coalesce((v_team->>'p2CheckedIn')::boolean, false);
  v_team := jsonb_set(v_team, '{checkedIn}', to_jsonb(v_checked_in), true);

  v_teams := jsonb_set(v_teams, array[v_idx::text], v_team, true);
  v_state := jsonb_set(v_state, '{teams}', v_teams, true);
  v_state := jsonb_set(v_state, '{updatedAt}', to_jsonb(round(extract(epoch from now()) * 1000)), true);

  update public.tournaments set public_state = v_state, updated_at = now() where id = p_tournament_id;

  return jsonb_build_object('team', v_team, 'teamCheckedIn', v_checked_in, 'state', v_state);
end;
$$;

grant execute on function public.submit_score_report(uuid, text, text, text, text, int, int) to service_role;
grant execute on function public.check_in_player(uuid, text, text) to service_role;
