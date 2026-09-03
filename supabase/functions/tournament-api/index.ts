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
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type' } }); }

function publicState(state: unknown) {
  const copy = JSON.parse(JSON.stringify(state || {}));
  if (copy && typeof copy === 'object') {
    delete copy.adminPinHash;
    delete copy.updatedAt;
    if (Array.isArray(copy.teams)) copy.teams.forEach((team: Record<string, unknown>) => delete team.pin);
    if (Array.isArray(copy.rr?.entities)) copy.rr.entities.forEach((entity: Record<string, unknown>) => delete entity.pin);
  }
  return copy;
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
      const accessRows = await Promise.all((kind === 'tournament' ? teams : []).filter((team: Record<string, unknown>) => team?.id != null && /^\d{4}$/.test(String(team.pin || ''))).map(async (team: Record<string, unknown>) => ({ tournament_id: created.id, team_id: String(team.id), pin_hash: await hashPin(String(team.pin)) })));
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
      return json({ sessionToken: await signSession({ tournament: tournamentCode, role: 'player', teamId: access.team_id }), teamId: access.team_id, state: tournament.public_state });
    }
    if (action === 'admin-save') {
      await verifySession(authToken, 'admin', tournamentCode);
      const nextState = body.state || {};
      const teams = tournament.event_type === 'round_robin' && nextState.rr && Array.isArray(nextState.rr.entities) ? nextState.rr.entities : (Array.isArray(nextState.teams) ? nextState.teams : []);
      for (const team of kind === 'tournament' ? teams : []) {
        if (team?.id != null && /^\d{4}$/.test(String(team.pin || ''))) await supabase.from('team_access').upsert({ tournament_id: tournament.id, team_id: String(team.id), pin_hash: await hashPin(String(team.pin)) }, { onConflict: 'tournament_id,team_id' });
      }
      const { error } = await supabase.from('tournaments').update({ public_state: publicState(nextState), updated_at: new Date().toISOString() }).eq('id', tournament.id);
      if (error) throw error;
      await supabase.from('audit_events').insert({ tournament_id: tournament.id, actor_role: 'admin', event_type: 'state_saved' });
      return json({ savedAt: new Date().toISOString() });
    }
    if (action === 'score-report') {
      const session = await verifySession(authToken, 'player', tournamentCode);
      if (String(session.teamId) !== String(body.teamAId) && String(session.teamId) !== String(body.teamBId)) throw new Error('This team is not part of the match.');
      const { error } = await supabase.from('score_reports').upsert({ tournament_id: tournament.id, match_id: body.matchId, team_id: String(session.teamId), team_a_score: body.teamAScore, team_b_score: body.teamBScore }, { onConflict: 'tournament_id,match_id,team_id' });
      if (error) throw error;
      await supabase.from('audit_events').insert({ tournament_id: tournament.id, actor_role: 'player', actor_id: String(session.teamId), event_type: 'score_reported', match_id: body.matchId });
      return json({ status: 'pending' });
    }
    if (action === 'public') return json({ state: tournament.public_state, updatedAt: tournament.updated_at });
    return json({ error: 'Unknown action.' }, 400);
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Request failed.' }, 400); }
});
