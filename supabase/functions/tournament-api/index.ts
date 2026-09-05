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

function recomputePoolStats(state: Record<string, unknown>) {
  const teams = Array.isArray(state.teams) ? state.teams as Record<string, unknown>[] : [];
  teams.forEach(team => { team.wins = 0; team.losses = 0; team.pf = 0; team.pa = 0; team.pd = 0; });
  const completed = state.completedMatches && typeof state.completedMatches === 'object' ? state.completedMatches as Record<string, Record<string, unknown>> : {};
  Object.values(completed).forEach(match => {
    const t1 = teams.find(team => String(team.id) === String(match.teamAId));
    const t2 = teams.find(team => String(team.id) === String(match.teamBId));
    const s1 = Number(match.s1);
    const s2 = Number(match.s2);
    if (!t1 || !t2 || !Number.isInteger(s1) || !Number.isInteger(s2) || s1 < 0 || s2 < 0 || s1 === s2) return;
    if (s1 > s2) { t1.wins = Number(t1.wins) + 1; t2.losses = Number(t2.losses) + 1; }
    else { t2.wins = Number(t2.wins) + 1; t1.losses = Number(t1.losses) + 1; }
    t1.pf = Number(t1.pf) + s1; t1.pa = Number(t1.pa) + s2; t1.pd = Number(t1.pd) + s1 - s2;
    t2.pf = Number(t2.pf) + s2; t2.pa = Number(t2.pa) + s1; t2.pd = Number(t2.pd) + s2 - s1;
  });
}

function applyScoreReport(state: Record<string, unknown>, session: Record<string, unknown>, body: Record<string, unknown>) {
  const matchId = String(body.matchId || '');
  if (!matchId) throw new Error('Match ID is required.');
  const teamAId = String(body.teamAId);
  const teamBId = String(body.teamBId);
  const teamAScore = Number(body.teamAScore);
  const teamBScore = Number(body.teamBScore);
  if (!Number.isInteger(teamAScore) || !Number.isInteger(teamBScore) || teamAScore < 0 || teamBScore < 0 || teamAScore === teamBScore) throw new Error('A valid non-tied score is required.');
  if (String(session.teamId) !== teamAId && String(session.teamId) !== teamBId) throw new Error('This team is not part of the match.');
  const teams = Array.isArray(state.teams) ? state.teams as Record<string, unknown>[] : [];
  if (!teams.some(team => String(team.id) === teamAId) || !teams.some(team => String(team.id) === teamBId)) throw new Error('This match is not part of the tournament.');
  const reports = state.scoreReports && typeof state.scoreReports === 'object' ? state.scoreReports as Record<string, Record<string, unknown>> : {};
  const completed = state.completedMatches && typeof state.completedMatches === 'object' ? state.completedMatches as Record<string, Record<string, unknown>> : {};
  const report = reports[matchId] || {};
  const reportKey = String(session.teamId) === teamAId ? 'teamA' : 'teamB';
  report[reportKey] = { s1: teamAScore, s2: teamBScore, submittedAt: new Date().toISOString(), teamId: String(session.teamId) };
  reports[matchId] = report;
  const other = report[reportKey === 'teamA' ? 'teamB' : 'teamA'] as Record<string, unknown> | undefined;
  if (other && Number(other.s1) === teamAScore && Number(other.s2) === teamBScore && !completed[matchId]) {
    completed[matchId] = { s1: teamAScore, s2: teamBScore, teamAId, teamBId, status: 'confirmed', resolvedBy: 'teams', resolvedAt: new Date().toISOString() };
    delete reports[matchId];
  }
  state.scoreReports = reports;
  state.completedMatches = completed;
  state.updatedAt = Date.now();
  recomputePoolStats(state);
  return Boolean(completed[matchId]);
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
      const { data: created, error } = await supabase.from('tournaments').insert({ code: tournamentCode, event_type: kind, display_name: body.displayName || tournamentCode, admin_pin_hash: await hashPin(adminPin), public_state: publicState(initialState) }).select().single();
      if (error) throw error;
      const teams = kind === 'round_robin' && initialState.rr && Array.isArray(initialState.rr.entities) ? initialState.rr.entities : (Array.isArray(initialState.teams) ? initialState.teams : []);
      const accessRows = await Promise.all((kind === 'tournament' ? teams : []).filter((team: Record<string, unknown>) => team?.id != null && /^\d{4}$/.test(String(team.pin || ''))).map(async (team: Record<string, unknown>) => ({ tournament_id: created.id, team_id: String(team.id), pin_hash: await hashPin(String(team.pin)), score_pin: String(team.pin) })));
      if (accessRows.length) { const { error: accessError } = await supabase.from('team_access').insert(accessRows); if (accessError) throw accessError; }
      return json({ sessionToken: await signSession({ tournament: tournamentCode, role: 'admin' }), state: created.public_state });
    }
    if (!tournament) return json({ error: 'Tournament not found.' }, 404);

    if (action === 'admin-login') {
      if ((await hashPin(pin(body.adminPin))) !== tournament.admin_pin_hash) return json({ error: 'Incorrect tournament code or admin PIN.' }, 403);
      return json({ sessionToken: await signSession({ tournament: tournamentCode, role: 'admin' }), state: tournament.public_state });
    }
    if (action === 'player-login') {
      const { data: access } = await supabase.from('team_access').select('team_id').eq('tournament_id', tournament.id).eq('pin_hash', await hashPin(pin(body.playerPin))).maybeSingle();
      if (!access) return json({ error: 'Incorrect tournament code or player PIN.' }, 403);
      return json({ sessionToken: await signSession({ tournament: tournamentCode, tournamentId: tournament.id, role: 'player', teamId: access.team_id, playerId: `${access.team_id}:score` }), teamId: access.team_id, playerId: `${access.team_id}:score`, state: tournament.public_state });
    }
    if (action === 'player-identify') {
      const playerName = String(body.playerName || '').trim().toLowerCase();
      if (!playerName) throw new Error('Player name is required.');
      const entries = playerEntries(tournament.public_state || {}).filter(entry => entry.name.trim().toLowerCase() === playerName);
      if (entries.length !== 1) return json({ error: entries.length ? 'More than one player matches that name. Ask the organizer for help.' : 'Player not found.' }, 403);
      const entry = entries[0];
      return json({ sessionToken: await signSession({ tournament: tournamentCode, tournamentId: tournament.id, role: 'player', teamId: entry.teamId, playerId: entry.playerId, playerSlot: entry.playerSlot }), teamId: entry.teamId, playerId: entry.playerId, playerSlot: entry.playerSlot, team: { id: entry.teamId, p1: entry.team.p1, p2: entry.team.p2 }, state: tournament.public_state });
    }
    if (action === 'admin-save') {
      await verifySession(authToken, 'admin', tournamentCode);
      const nextState = body.state || {};
      const teams = tournament.event_type === 'round_robin' && nextState.rr && Array.isArray(nextState.rr.entities) ? nextState.rr.entities : (Array.isArray(nextState.teams) ? nextState.teams : []);
      for (const team of kind === 'tournament' ? teams : []) {
        if (team?.id != null && /^\d{4}$/.test(String(team.pin || ''))) await supabase.from('team_access').upsert({ tournament_id: tournament.id, team_id: String(team.id), pin_hash: await hashPin(String(team.pin)), score_pin: String(team.pin) }, { onConflict: 'tournament_id,team_id' });
      }
      const { error } = await supabase.from('tournaments').update({ public_state: publicState(nextState), updated_at: new Date().toISOString() }).eq('id', tournament.id);
      if (error) throw error;
      await supabase.from('audit_events').insert({ tournament_id: tournament.id, actor_role: 'admin', event_type: 'state_saved' });
      return json({ savedAt: new Date().toISOString() });
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
      const nextState = JSON.parse(JSON.stringify(tournament.public_state || {}));
      const confirmed = applyScoreReport(nextState, session, body);
      const { error } = await supabase.from('score_reports').upsert({ tournament_id: tournament.id, match_id: body.matchId, team_id: String(session.teamId), team_a_score: body.teamAScore, team_b_score: body.teamBScore }, { onConflict: 'tournament_id,match_id,team_id' });
      if (error) throw error;
      const { error: stateError } = await supabase.from('tournaments').update({ public_state: publicState(nextState), updated_at: new Date().toISOString() }).eq('id', tournament.id);
      if (stateError) throw stateError;
      await supabase.from('audit_events').insert({ tournament_id: tournament.id, actor_role: 'player', actor_id: String(session.teamId), event_type: 'score_reported', match_id: body.matchId });
      return json({ status: confirmed ? 'confirmed' : 'pending', state: publicState(nextState) });
    }
    if (action === 'player-checkin') {
      const session = await verifySession(authToken, 'player', tournamentCode);
      const requestedTeamId = String(session.teamId || '');
      const playerSlot = session.playerSlot === 'p2' ? 'p2' : session.playerSlot === 'p1' ? 'p1' : null;
      if (!playerSlot) return json({ error: 'Use individual player check-in before scoring.' }, 403);
      if ((body.teamId != null && String(body.teamId) !== requestedTeamId) || (body.playerSlot != null && String(body.playerSlot) !== playerSlot)) return json({ error: 'Players can only check in themselves.' }, 403);
      const nextState = JSON.parse(JSON.stringify(tournament.public_state || {}));
      const teams = Array.isArray(nextState.teams) ? nextState.teams : [];
      const team = teams.find((item: Record<string, unknown>) => String(item.id) === requestedTeamId);
      if (!team) throw new Error('This team is not part of the tournament.');
      team[`${playerSlot}CheckedIn`] = true;
      team.checkedIn = Boolean(team.p1CheckedIn && team.p2CheckedIn);
      nextState.updatedAt = Date.now();
      const { error } = await supabase.from('tournaments').update({ public_state: publicState(nextState), updated_at: new Date().toISOString() }).eq('id', tournament.id);
      if (error) throw error;
      const { data: access } = await supabase.from('team_access').select('score_pin').eq('tournament_id', tournament.id).eq('team_id', requestedTeamId).maybeSingle();
      await supabase.from('audit_events').insert({ tournament_id: tournament.id, actor_role: 'player', actor_id: String(session.playerId), event_type: 'player_checked_in', details: { teamId: requestedTeamId, playerSlot } });
      return json({ status: 'checked-in', teamId: requestedTeamId, playerId: session.playerId, playerSlot, scorePin: access?.score_pin, team, teamCheckedIn: team.checkedIn, stranded: playerCheckedIn(team, 'p1') !== playerCheckedIn(team, 'p2'), state: publicState(nextState) });
    }
    if (action === 'public') return json({ state: tournament.public_state, updatedAt: tournament.updated_at });
    return json({ error: 'Unknown action.' }, 400);
  } catch (error) { return json({ error: errorMessage(error) }, 400); }
});
