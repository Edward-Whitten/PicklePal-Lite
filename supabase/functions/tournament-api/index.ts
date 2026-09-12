import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.115.0';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('PICKLEPAL_SERVICE_ROLE_KEY')!,
);
const encoder = new TextEncoder();
const secret = Deno.env.get('PICKLEPAL_SESSION_SECRET')!;

function hashPin(pin: string) {
  return crypto.subtle.digest('SHA-256', encoder.encode(pin)).then(bytes =>
    [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join(''));
}
function code(value: unknown) {
  const valueText = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9]{1,48}$/.test(valueText)) throw new Error('A one-word tournament code is required.');
  return valueText;
}
function eventType(value: unknown) { return value === 'round_robin' ? 'round_robin' : 'tournament'; }
const TOURNAMENT_STATUSES = ['setup', 'active', 'paused', 'completed'];
// The tournaments.status column is authoritative; public_state.status is kept in sync for convenience only.
function resolvedStatus(candidate: unknown, fallback: string) {
  return typeof candidate === 'string' && TOURNAMENT_STATUSES.includes(candidate) ? candidate : fallback;
}
function withStatus<T extends Record<string, unknown>>(state: T, status: string): T {
  return { ...state, status };
}
// Falls back to the legacy single admin_pin_hash for rows the array-backfill migration hasn't reached.
function managerPinHashes(tournament: Record<string, unknown>): string[] {
  const hashes = Array.isArray(tournament.manager_pin_hashes) ? tournament.manager_pin_hashes as string[] : [];
  return hashes.length ? hashes : [String(tournament.admin_pin_hash)];
}
function pin(value: unknown) {
  const valueText = String(value ?? '');
  if (!/^\d{4}$/.test(valueText)) throw new Error('A four-digit PIN is required.');
  return valueText;
}
async function signSession(payload: Record<string, unknown>) {
  const body = btoa(JSON.stringify({ ...payload, exp: Date.now() + 8 * 60 * 60 * 1000 }));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return `${body}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}
async function verifySession(token: string | null, expectedRole: string, tournament: string) {
  if (!token) throw new Error('Authentication required.');
  const [body, provided] = token.split('.');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, Uint8Array.from(atob(provided), char => char.charCodeAt(0)), encoder.encode(body));
  const session = JSON.parse(atob(body));
  if (!valid || session.exp < Date.now() || session.role !== expectedRole || session.tournament !== tournament) throw new Error('Session expired or unauthorized.');
  return session;
}
// If this browser already holds a valid player session for a different team, refuse to switch teams silently.
// A brand-new device (no prior session, or an unrelated/expired one) is unaffected and logs in normally.
async function assertNoTeamSwitch(authToken: string | null, tournamentCode: string, newTeamId: unknown) {
  if (!authToken) return;
  try {
    const existing = await verifySession(authToken, 'player', tournamentCode);
    if (String(existing.teamId) !== String(newTeamId)) {
      throw new Error('Unauthorized: This code does not match your registered team.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unauthorized:')) throw error;
    // Any other verification failure just means there is no valid prior player session to compare against.
  }
}
function json(data: unknown, status = 200) { return new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey,authorization,content-type', 'access-control-allow-methods': 'OPTIONS,POST' } }); }
function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return String(error);
}

function publicState(state: unknown) {
  const copy = JSON.parse(JSON.stringify(state || {}));
  if (copy && typeof copy === 'object') {
    delete copy.adminPinHash;
    if (Array.isArray(copy.teams)) copy.teams.forEach((team: Record<string, unknown>) => delete team.pin);
    if (Array.isArray(copy.rr?.entities)) copy.rr.entities.forEach((entity: Record<string, unknown>) => delete entity.pin);
  }
  return copy;
}

async function managerState(tournamentId: string, state: unknown) {
  const copy = JSON.parse(JSON.stringify(state || {}));
  const teams = Array.isArray(copy.teams) ? copy.teams as Record<string, unknown>[] : [];
  if (!teams.length) return copy;
  const { data: accessRows, error } = await supabase.from('team_access').select('team_id,score_pin').eq('tournament_id', tournamentId);
  if (error) throw error;
  const pins = new Map((accessRows || []).map((row: Record<string, unknown>) => [String(row.team_id), String(row.score_pin || '')]));
  teams.forEach(team => {
    const scorePin = pins.get(String(team.id));
    if (scorePin) team.pin = scorePin;
  });
  return copy;
}

function playerEntries(state: Record<string, unknown>) {
  const teams = Array.isArray(state.teams) ? state.teams as Record<string, unknown>[] : [];
  return teams.filter(team => team.active !== false).flatMap(team => [
    { team, teamId: String(team.id), playerSlot: 'p1', playerId: `${team.id}:p1`, name: String(team.p1 || 'Player 1'), partner: String(team.p2 || 'Player 2') },
    { team, teamId: String(team.id), playerSlot: 'p2', playerId: `${team.id}:p2`, name: String(team.p2 || 'Player 2'), partner: String(team.p1 || 'Player 1') },
  ]);
}

function playerCheckedIn(team: Record<string, unknown>, playerSlot: string) {
  return Boolean(team[`${playerSlot}CheckedIn`] || (team.checkedIn && team[`${playerSlot}CheckedIn`] !== false));
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return json({}, 204);
  try {
    const body = await request.json();
    const action = body.action;
    const tournamentCode = code(body.tournament);
    const kind = eventType(body.kind);
    const authToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
    const { data: tournament } = await supabase.from('tournaments').select('*').eq('code', tournamentCode).eq('event_type', kind).maybeSingle();

    if (action === 'create') {
      const adminPin = pin(body.adminPin);
      if (tournament) return json({ error: 'That tournament code is already in use.' }, 409);
      const initialState = body.state || {};
      const adminPinHash = await hashPin(adminPin);
      const { data: created, error } = await supabase.from('tournaments').insert({ code: tournamentCode, event_type: kind, display_name: body.displayName || tournamentCode, admin_pin_hash: adminPinHash, manager_pin_hashes: [adminPinHash], status: 'setup', public_state: publicState(initialState) }).select().single();
      if (error) throw error;
      const teams = kind === 'round_robin' && initialState.rr && Array.isArray(initialState.rr.entities) ? initialState.rr.entities : (Array.isArray(initialState.teams) ? initialState.teams : []);
      const accessRows = await Promise.all((kind === 'tournament' ? teams : []).filter((team: Record<string, unknown>) => team?.id != null && /^\d{4}$/.test(String(team.pin || ''))).map(async (team: Record<string, unknown>) => ({ tournament_id: created.id, team_id: String(team.id), pin_hash: await hashPin(String(team.pin)), score_pin: String(team.pin) })));
      if (accessRows.length) { const { error: accessError } = await supabase.from('team_access').insert(accessRows); if (accessError) throw accessError; }
      return json({ sessionToken: await signSession({ tournament: tournamentCode, tournamentId: created.id, role: 'admin' }), state: withStatus(await managerState(created.id, created.public_state), created.status) });
    }
    if (!tournament) return json({ error: 'Tournament not found.' }, 404);

    if (action === 'admin-login') {
      if (!managerPinHashes(tournament).includes(await hashPin(pin(body.adminPin)))) return json({ error: 'Incorrect tournament code or admin PIN.' }, 403);
      return json({ sessionToken: await signSession({ tournament: tournamentCode, tournamentId: tournament.id, role: 'admin' }), state: withStatus(await managerState(tournament.id, tournament.public_state), tournament.status) });
    }
    if (action === 'admin-state') {
      await verifySession(authToken, 'admin', tournamentCode);
      return json({ state: withStatus(await managerState(tournament.id, tournament.public_state), tournament.status), updatedAt: tournament.updated_at, managerPinCount: managerPinHashes(tournament).length });
    }
    if (action === 'add-manager-pin') {
      await verifySession(authToken, 'admin', tournamentCode);
      const newHash = await hashPin(pin(body.pin));
      const existing = managerPinHashes(tournament);
      if (existing.includes(newHash)) return json({ error: 'That PIN is already in use for this tournament.' }, 409);
      if (existing.length >= 8) return json({ error: 'Maximum of 8 manager PINs reached.' }, 400);
      const updated = [...existing, newHash];
      const { error } = await supabase.from('tournaments').update({ manager_pin_hashes: updated }).eq('id', tournament.id);
      if (error) throw error;
      await supabase.from('audit_events').insert({ tournament_id: tournament.id, actor_role: 'admin', event_type: 'manager_pin_added' });
      return json({ status: 'added', count: updated.length });
    }
    if (action === 'revoke-manager-pin') {
      await verifySession(authToken, 'admin', tournamentCode);
      const index = Number(body.index);
      const existing = managerPinHashes(tournament);
      if (!Number.isInteger(index) || index < 0 || index >= existing.length) throw new Error('Invalid PIN reference.');
      if (existing.length <= 1) return json({ error: 'At least one manager PIN must remain.' }, 400);
      const updated = existing.filter((_, i) => i !== index);
      const { error } = await supabase.from('tournaments').update({ manager_pin_hashes: updated }).eq('id', tournament.id);
      if (error) throw error;
      await supabase.from('audit_events').insert({ tournament_id: tournament.id, actor_role: 'admin', event_type: 'manager_pin_revoked' });
      return json({ status: 'revoked', count: updated.length });
    }
    if (action === 'player-login') {
      const { data: access } = await supabase.from('team_access').select('team_id').eq('tournament_id', tournament.id).eq('pin_hash', await hashPin(pin(body.playerPin))).maybeSingle();
      if (!access) return json({ error: 'Incorrect tournament code or player PIN.' }, 403);
      await assertNoTeamSwitch(authToken, tournamentCode, access.team_id);
      return json({ sessionToken: await signSession({ tournament: tournamentCode, tournamentId: tournament.id, role: 'player', teamId: access.team_id, playerId: `${access.team_id}:score` }), teamId: access.team_id, playerId: `${access.team_id}:score`, state: withStatus(tournament.public_state, tournament.status) });
    }
    if (action === 'player-identify') {
      const playerName = String(body.playerName || '').trim().toLowerCase();
      if (!playerName) throw new Error('Player name is required.');
      const entries = playerEntries(tournament.public_state || {}).filter(entry => entry.name.trim().toLowerCase() === playerName);
      if (entries.length !== 1) return json({ error: entries.length ? 'More than one player matches that name. Ask the organizer for help.' : 'Player not found.' }, 403);
      const entry = entries[0];
      await assertNoTeamSwitch(authToken, tournamentCode, entry.teamId);
      return json({ sessionToken: await signSession({ tournament: tournamentCode, tournamentId: tournament.id, role: 'player', teamId: entry.teamId, playerId: entry.playerId, playerSlot: entry.playerSlot }), teamId: entry.teamId, playerId: entry.playerId, playerSlot: entry.playerSlot, team: { id: entry.teamId, p1: entry.team.p1, p2: entry.team.p2 }, state: withStatus(tournament.public_state, tournament.status) });
    }
    if (action === 'admin-save') {
      await verifySession(authToken, 'admin', tournamentCode);
      const nextState = body.state || {};
      const nextStatus = resolvedStatus(nextState.status, tournament.status);
      const teams = tournament.event_type === 'round_robin' && nextState.rr && Array.isArray(nextState.rr.entities) ? nextState.rr.entities : (Array.isArray(nextState.teams) ? nextState.teams : []);
      for (const team of kind === 'tournament' ? teams : []) {
        if (team?.id != null && /^\d{4}$/.test(String(team.pin || ''))) await supabase.from('team_access').upsert({ tournament_id: tournament.id, team_id: String(team.id), pin_hash: await hashPin(String(team.pin)), score_pin: String(team.pin) }, { onConflict: 'tournament_id,team_id' });
      }
      const { error } = await supabase.from('tournaments').update({ public_state: publicState(withStatus(nextState, nextStatus)), status: nextStatus, updated_at: new Date().toISOString() }).eq('id', tournament.id);
      if (error) throw error;
      await supabase.from('audit_events').insert({ tournament_id: tournament.id, actor_role: 'admin', event_type: 'state_saved' });
      return json({ savedAt: new Date().toISOString(), status: nextStatus });
    }
    if (action === 'delete-event') {
      await verifySession(authToken, 'admin', tournamentCode);
      await supabase.from('score_reports').delete().eq('tournament_id', tournament.id);
      await supabase.from('team_access').delete().eq('tournament_id', tournament.id);
      await supabase.from('audit_events').delete().eq('tournament_id', tournament.id);
      const { error } = await supabase.from('tournaments').delete().eq('id', tournament.id);
      if (error) throw error;
      return json({ status: 'deleted' });
    }
    if (action === 'score-report') {
      const session = await verifySession(authToken, 'player', tournamentCode);
      const matchId = String(body.matchId || '');
      if (!matchId) throw new Error('Match ID is required.');
      const teamAId = String(body.teamAId);
      const teamBId = String(body.teamBId);
      const teamAScore = Number(body.teamAScore);
      const teamBScore = Number(body.teamBScore);
      if (!Number.isInteger(teamAScore) || !Number.isInteger(teamBScore) || teamAScore < 0 || teamBScore < 0) throw new Error('A valid non-tied score is required.');
      const { error } = await supabase.from('score_reports').upsert({ tournament_id: tournament.id, match_id: matchId, team_id: String(session.teamId), team_a_score: teamAScore, team_b_score: teamBScore }, { onConflict: 'tournament_id,match_id,team_id' });
      if (error) throw error;
      // Atomic RPC: locks the tournament row for the duration of the merge so concurrent score
      // reports from other matches/teams can never overwrite each other (see migration for details).
      const { data: result, error: rpcError } = await supabase.rpc('submit_score_report', {
        p_tournament_id: tournament.id,
        p_team_id: String(session.teamId),
        p_match_id: matchId,
        p_team_a_id: teamAId,
        p_team_b_id: teamBId,
        p_team_a_score: teamAScore,
        p_team_b_score: teamBScore,
      });
      if (rpcError) throw rpcError;
      await supabase.from('audit_events').insert({ tournament_id: tournament.id, actor_role: 'player', actor_id: String(session.teamId), event_type: 'score_reported', match_id: matchId });
      return json({ status: result.confirmed ? 'confirmed' : 'pending', state: publicState(result.state) });
    }
    if (action === 'player-checkin') {
      const session = await verifySession(authToken, 'player', tournamentCode);
      const requestedTeamId = String(session.teamId || '');
      const playerSlot = session.playerSlot === 'p2' ? 'p2' : session.playerSlot === 'p1' ? 'p1' : null;
      if (!playerSlot) return json({ error: 'Use individual player check-in before scoring.' }, 403);
      if ((body.teamId != null && String(body.teamId) !== requestedTeamId) || (body.playerSlot != null && String(body.playerSlot) !== playerSlot)) return json({ error: 'Players can only check in themselves.' }, 403);
      // Atomic RPC: locks the tournament row so simultaneous check-ins from other players/teams
      // (the busiest moment of the event) can never overwrite each other's checked-in status.
      const { data: result, error: rpcError } = await supabase.rpc('check_in_player', {
        p_tournament_id: tournament.id,
        p_team_id: requestedTeamId,
        p_player_slot: playerSlot,
      });
      if (rpcError) throw rpcError;
      const team = result.team as Record<string, unknown>;
      const { data: access } = await supabase.from('team_access').select('score_pin').eq('tournament_id', tournament.id).eq('team_id', requestedTeamId).maybeSingle();
      await supabase.from('audit_events').insert({ tournament_id: tournament.id, actor_role: 'player', actor_id: String(session.playerId), event_type: 'player_checked_in', details: { teamId: requestedTeamId, playerSlot } });
      return json({ status: 'checked-in', teamId: requestedTeamId, playerId: session.playerId, playerSlot, scorePin: access?.score_pin, team, teamCheckedIn: result.teamCheckedIn, stranded: playerCheckedIn(team, 'p1') !== playerCheckedIn(team, 'p2'), state: publicState(result.state) });
    }
    if (action === 'public') return json({ state: withStatus(tournament.public_state, tournament.status), updatedAt: tournament.updated_at });
    return json({ error: 'Unknown action.' }, 400);
  } catch (error) { return json({ error: errorMessage(error) }, 400); }
});
