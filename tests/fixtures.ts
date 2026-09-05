import type { Page } from '@playwright/test';

export const tournamentCode = 'e2echeck';
export const managerPin = '1600';
export const playerAPin = '1111';
export const playerBPin = '2222';

export function tournamentState() {
  const teams = [
    { id: 1, pin: playerAPin, p1: 'Alexandra Verylonglastname', p2: 'Benjamin Example', checkedIn: true, pool: 0, wins: 1, losses: 0, pf: 11, pa: 7, pd: 4, active: true },
    { id: 2, pin: playerBPin, p1: 'Cameron Sample', p2: 'Devon Player', checkedIn: true, pool: 0, wins: 0, losses: 1, pf: 7, pa: 11, pd: -4, active: true },
    { id: 3, pin: '3333', p1: 'Emerson Test', p2: 'Finley Squad', checkedIn: true, pool: 0, wins: 0, losses: 0, pf: 0, pa: 0, pd: 0, active: true },
    { id: 4, pin: '4444', p1: 'Gray Team', p2: 'Harper Pair', checkedIn: true, pool: 0, wins: 0, losses: 0, pf: 0, pa: 0, pd: 0, active: true },
  ];

  return {
    appMode: 'tourney',
    tournamentNickname: tournamentCode,
    expectedTeams: 4,
    advancementCount: 4,
    poolCount: 1,
    theme: 'dark',
    setupMode: 'manual',
    header: { title: 'E2E Tournament', date: '2026-09-04', loc: 'Test Courts', org: 'Auralogic Solutions', man: 'QA Manager', logoDarkTheme: 'Compass-Logo-White.png', logoLightTheme: 'Compass-Logo-White.png' },
    teams,
    completedMatches: {},
    scoreReports: {},
    poolSchedule: [],
    courts: {},
    stranded: [],
  };
}

export async function seedTournament(page: Page, options: { manager?: boolean; player?: boolean } = {}) {
  const state = tournamentState();
  let identifiedPlayer: { teamId: string; playerSlot: 'p1' | 'p2'; playerId: string } | null = null;
  await page.route('**/functions/v1/tournament-api', async route => {
    const rawBody = route.request().postData();
    if (!rawBody) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    const body = JSON.parse(rawBody) as { action?: string; tournament?: string; adminPin?: string; playerPin?: string; playerName?: string; state?: unknown };
    if (body.action === 'public') {
      await route.abort();
      return;
    }
    if (body.tournament !== tournamentCode) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Tournament not found.' }) });
      return;
    }
    if (body.action === 'admin-login' && body.adminPin !== managerPin) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Incorrect tournament code or admin PIN.' }) });
      return;
    }
    if (body.action === 'player-login') {
      const team = state.teams.find(item => item.pin === body.playerPin);
      if (!team) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Incorrect tournament code or player PIN.' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionToken: 'player-token', teamId: String(team.id), playerId: `${team.id}:score`, state }) });
      return;
    }
    if (body.action === 'player-identify') {
      const needle = String(body.playerName || '').trim().toLowerCase();
      const entries = state.teams.flatMap(team => [
        { team, teamId: String(team.id), playerSlot: 'p1' as const, playerId: `${team.id}:p1`, name: team.p1 },
        { team, teamId: String(team.id), playerSlot: 'p2' as const, playerId: `${team.id}:p2`, name: team.p2 },
      ]).filter(entry => entry.name.toLowerCase() === needle);
      if (entries.length !== 1) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Player not found.' }) });
        return;
      }
      identifiedPlayer = entries[0];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionToken: 'player-identify-token', teamId: identifiedPlayer.teamId, playerId: identifiedPlayer.playerId, playerSlot: identifiedPlayer.playerSlot, team: identifiedPlayer.team }) });
      return;
    }
    if (body.action === 'player-checkin') {
      if (!identifiedPlayer) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Authentication required.' }) });
        return;
      }
      if ((body as any).teamId && String((body as any).teamId) !== identifiedPlayer.teamId) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Players can only check in themselves.' }) });
        return;
      }
      const team = state.teams.find(item => String(item.id) === identifiedPlayer!.teamId)!;
      team[`${identifiedPlayer.playerSlot}CheckedIn`] = true;
      team.checkedIn = Boolean(team.p1CheckedIn && team.p2CheckedIn);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'checked-in', teamId: identifiedPlayer.teamId, playerId: identifiedPlayer.playerId, playerSlot: identifiedPlayer.playerSlot, scorePin: team.pin, teamCheckedIn: team.checkedIn, stranded: team.p1CheckedIn !== team.p2CheckedIn }) });
      return;
    }
    if (body.action === 'delete-event') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'deleted' }) });
      return;
    }
    if (body.action === 'score-report') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'pending' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionToken: 'admin-token', state: body.state || state, savedAt: new Date().toISOString() }) });
  });
  await page.addInitScript(({ code, serializedState, manager, player }) => {
    localStorage.setItem(`picklepal_tournament_${code}`, serializedState);
    if (manager) {
      localStorage.setItem('picklepal_active_tournament', code);
      localStorage.setItem('picklepal_admin_session', code);
    }
    if (player) {
      localStorage.setItem('picklepal_portal_nickname', code);
      localStorage.setItem('picklepal_portal_role', 'player');
    }
  }, { code: tournamentCode, serializedState: JSON.stringify(state), manager: Boolean(options.manager), player: Boolean(options.player) });
}

export async function expectNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}