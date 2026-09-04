import { expect, test } from '@playwright/test';
import { managerPin, tournamentCode, tournamentState } from './fixtures';

function teams(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    pin: String(1100 + index),
    p1: `Player ${index + 1}A`,
    p2: `Player ${index + 1}B`,
    checkedIn: true,
    pool: index < Math.ceil(count / 2) ? 0 : 1,
    wins: count - index,
    losses: index % 2,
    pf: 11 * (count - index),
    pa: 7 * index,
    pd: count - index,
    active: true,
  }));
}

test.describe('production hotfix regressions', () => {
  test('loads the active scoped tournament instead of legacy tournament state', async ({ page }) => {
    const tournamentA = { ...tournamentState(), tournamentNickname: 'alpha', header: { ...tournamentState().header, title: 'Alpha Event' }, teams: teams(2) };
    const tournamentB = { ...tournamentState(), tournamentNickname: tournamentCode, header: { ...tournamentState().header, title: 'Scoped Event' }, teams: teams(4) };
    await page.addInitScript(({ a, b, code }) => {
      localStorage.setItem('picklepal_2026', JSON.stringify(a));
      localStorage.setItem(`picklepal_tournament_${code}`, JSON.stringify(b));
      localStorage.setItem('picklepal_active_tournament', code);
      localStorage.setItem('picklepal_admin_session', code);
    }, { a: tournamentA, b: tournamentB, code: tournamentCode });
    await page.goto('/index.html');
    await expect(page.locator('#head-title')).toHaveValue('Scoped Event');
    await page.getByRole('button', { name: 'Check-In' }).click();
    await expect(page.locator('#roster-list .team-row-entry')).toHaveCount(4);
  });

  test('does not resurrect a deleted tournament from local cache on word lookup', async ({ page }) => {
    await page.route('**/functions/v1/tournament-api', route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Tournament not found.' }) }));
    await page.addInitScript(() => {
      localStorage.setItem('picklepal_tournament_deletedword', JSON.stringify({ ...{ teams: [{ id: 1, p1: 'Hello', p2: 'Fred', active: true }] } }));
    });
    await page.goto('/players.html?event=deletedword');
    await expect(page.locator('#tournament-message')).toContainText('Tournament not found');
    await expect(page.locator('#event-tabs')).toHaveClass(/hidden/);
    await expect(page.locator('body')).not.toContainText('Hello');
  });

  test('word lookup overwrites stale local roster with fresh canonical roster', async ({ page }) => {
    const freshState = { ...tournamentState(), tournamentNickname: 'compass', teams: teams(13), poolCount: 3, poolSize: 5, advancementCount: 4 };
    await page.route('**/functions/v1/tournament-api', async route => {
      const rawBody = route.request().postData();
      if (!rawBody) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: freshState }) });
    });
    await page.addInitScript(() => {
      localStorage.setItem('picklepal_tournament_compass', JSON.stringify({ teams: [{ id: 1, p1: 'Hello', p2: 'Fred', active: true }] }));
    });
    await page.goto('/players.html?event=compass');
    await expect(page.locator('#event-summary')).toContainText('13');
    await expect(page.locator('body')).not.toContainText('Hello');
  });

  test('pool size 5 is accepted and used for generated pools', async ({ page }) => {
    const state = { ...tournamentState(), expectedTeams: 10, poolSize: 5, advancementCount: 4, teams: teams(10) };
    await page.addInitScript(({ code, state }) => {
      localStorage.setItem(`picklepal_tournament_${code}`, JSON.stringify(state));
      localStorage.setItem('picklepal_active_tournament', code);
      localStorage.setItem('picklepal_admin_session', code);
    }, { code: tournamentCode, state });
    await page.goto('/index.html');
    await page.getByRole('button', { name: 'Check-In' }).click();
    await expect(page.locator('#pool-size-select')).toHaveValue('5');
    await page.getByRole('button', { name: 'Randomly Assign Pools' }).click();
    await expect(page.locator('#modal-title')).toHaveText('Pools Generated');
    const sizes = await page.evaluate(code => {
      const stored = JSON.parse(localStorage.getItem(`picklepal_tournament_${code}`)!);
      return Array.from({ length: stored.poolCount }, (_, pool) => stored.teams.filter((team: any) => team.active && team.pool === pool).length);
    }, tournamentCode);
    expect(sizes).toEqual([5, 5]);
  });

  test('9-team tournament with advancing 4 seeds semifinals, not a round of 16', async ({ page }) => {
    const state = { ...tournamentState(), expectedTeams: 9, allowOddTeams: true, poolSize: 5, poolCount: 2, advancementCount: 4, teams: teams(9) };
    await page.addInitScript(({ code, state }) => {
      localStorage.setItem(`picklepal_tournament_${code}`, JSON.stringify(state));
      localStorage.setItem('picklepal_active_tournament', code);
      localStorage.setItem('picklepal_admin_session', code);
    }, { code: tournamentCode, state });
    await page.goto('/index.html');
    await page.getByRole('button', { name: 'Elimination Bracket' }).click();
    await page.getByRole('button', { name: 'Seed Bracket' }).click();
    await expect(page.locator('#modal-title')).toHaveText('Bracket Generated');
    await expect(page.locator('#bracket-ui')).toContainText('Semifinal 1');
    await expect(page.locator('#bracket-ui')).not.toContainText('Round of 16');
  });

  test('matching player score reports update standings and manager correction recomputes them', async ({ page }) => {
    const state = { ...tournamentState(), teams: teams(4), completedMatches: {}, scoreReports: {} };
    await page.addInitScript(({ code, state }) => {
      localStorage.setItem(`picklepal_tournament_${code}`, JSON.stringify(state));
      localStorage.setItem('picklepal_active_tournament', code);
      localStorage.setItem('picklepal_admin_session', code);
    }, { code: tournamentCode, state });
    await page.goto('/index.html');
    const applied = await page.evaluate(() => {
      window.state = undefined;
      return true;
    });
    expect(applied).toBe(true);
    await page.evaluate(() => {
      const matchId = 'm-1-2';
      state.scoreReports[matchId] = {
        teamA: { s1: 11, s2: 7, teamId: 1, submittedAt: new Date().toISOString() },
        teamB: { s1: 11, s2: 7, teamId: 2, submittedAt: new Date().toISOString() },
      };
      finalizePoolMatch(matchId, 1, 2, 11, 7, 'teams');
    });
    let stored = await page.evaluate(code => JSON.parse(localStorage.getItem(`picklepal_tournament_${code}`)!), tournamentCode);
    expect(stored.completedMatches['m-1-2']).toMatchObject({ s1: 11, s2: 7, teamAId: 1, teamBId: 2, resolvedBy: 'teams' });
    expect(stored.teams.find((team: any) => team.id === 1)).toMatchObject({ wins: 1, losses: 0, pf: 11, pa: 7, pd: 4 });
    await page.evaluate(() => finalizePoolMatch('m-1-2', 1, 2, 7, 11, 'admin-correction'));
    stored = await page.evaluate(code => JSON.parse(localStorage.getItem(`picklepal_tournament_${code}`)!), tournamentCode);
    expect(stored.completedMatches['m-1-2']).toMatchObject({ s1: 7, s2: 11, resolvedBy: 'admin-correction' });
    expect(stored.teams.find((team: any) => team.id === 1)).toMatchObject({ wins: 0, losses: 1, pf: 7, pa: 11, pd: -4 });
    expect(stored.teams.find((team: any) => team.id === 2)).toMatchObject({ wins: 1, losses: 0, pf: 11, pa: 7, pd: 4 });
  });
});