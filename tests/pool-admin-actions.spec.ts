import { expect, test } from '@playwright/test';
import { seedTournament, tournamentState } from './fixtures';

// index.html is a classic script: `state` is a global lexical binding
// reachable as a bare identifier, but NOT as window.state.
declare const state: any;
declare function resetPoolScores(): Promise<void>;
declare function randomizePools(): Promise<void>;

function twoPoolStateWithScores() {
  const base = tournamentState();
  const teams = base.teams.map((team, index) => ({ ...team, pool: index < 2 ? 0 : 1 }));
  return {
    ...base,
    teams,
    poolCount: 2,
    completedMatches: {
      'm-1-2': { s1: 11, s2: 7, teamAId: 1, teamBId: 2, status: 'confirmed', resolvedBy: 'teams', resolvedAt: new Date().toISOString(), correctedFrom: null },
    },
    scoreReports: {
      'm-3-4': { teamA: { s1: 11, s2: 9, teamId: 3, submittedAt: new Date().toISOString() } },
    },
    courts: { 'm-1-2': 'Court 1' },
  } as ReturnType<typeof tournamentState>;
}

async function openManager(page: import('@playwright/test').Page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof randomizePools === 'function');
}

async function openCompetitionPools(page: import('@playwright/test').Page) {
  const mobile = (await page.viewportSize())!.width <= 640;
  await (mobile ? page.locator('#mob-nav-pools') : page.getByRole('button', { name: 'Competition' })).click();
}

test.describe('Pool admin soft-reset actions', () => {
  test.beforeEach(async ({ page }) => {
    await seedTournament(page, { manager: true, state: twoPoolStateWithScores() });
  });

  test('Reset Scores and Randomize Pools buttons are present in Pool Play', async ({ page }) => {
    await openManager(page);
    await openCompetitionPools(page);
    await expect(page.getByRole('button', { name: 'Reset Scores' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Randomize Pools' })).toBeVisible();
  });

  test('resetPoolScores clears results but preserves teams and pool assignments', async ({ page }) => {
    await openManager(page);

    const result = await page.evaluate(async () => {
      (window as any).appConfirm = async () => true;
      (window as any).appAlert = async () => true;
      const poolsBefore = state.teams.map((t: any) => t.pool);
      await resetPoolScores();
      return {
        completedMatchCount: Object.keys(state.completedMatches).length,
        scoreReportCount: Object.keys(state.scoreReports).length,
        teamCount: state.teams.length,
        poolsUnchanged: JSON.stringify(poolsBefore) === JSON.stringify(state.teams.map((t: any) => t.pool)),
        winsZeroed: state.teams.every((t: any) => t.wins === 0 && t.losses === 0 && t.pf === 0 && t.pa === 0),
      };
    });

    expect(result.completedMatchCount).toBe(0);
    expect(result.scoreReportCount).toBe(0);
    expect(result.teamCount).toBe(4);
    expect(result.poolsUnchanged).toBe(true);
    expect(result.winsZeroed).toBe(true);
  });

  test('resetPoolScores does nothing if the manager declines the confirmation', async ({ page }) => {
    await openManager(page);

    const result = await page.evaluate(async () => {
      (window as any).appConfirm = async () => false;
      await resetPoolScores();
      return Object.keys(state.completedMatches).length;
    });

    expect(result).toBe(1);
  });

  test('randomizePools reshuffles teams and clears stale results without deleting teams', async ({ page }) => {
    await openManager(page);

    const result = await page.evaluate(async () => {
      (window as any).appPrompt = async () => 'RANDOMIZE';
      (window as any).appAlert = async () => true;
      const teamIdsBefore = state.teams.map((t: any) => t.id).sort();
      await randomizePools();
      return {
        teamIdsMatch: JSON.stringify(teamIdsBefore) === JSON.stringify([...state.teams.map((t: any) => t.id)].sort()),
        completedMatchCount: Object.keys(state.completedMatches).length,
        scoreReportCount: Object.keys(state.scoreReports).length,
        courtCount: Object.keys(state.courts).length,
        poolCount: state.poolCount,
        allTeamsHavePool: state.teams.every((t: any) => Number.isInteger(t.pool)),
      };
    });

    expect(result.teamIdsMatch).toBe(true);
    expect(result.completedMatchCount).toBe(0);
    expect(result.scoreReportCount).toBe(0);
    expect(result.courtCount).toBe(0);
    expect(result.poolCount).toBe(2);
    expect(result.allTeamsHavePool).toBe(true);
  });

  test('randomizePools aborts unless the manager types the exact confirmation phrase', async ({ page }) => {
    await openManager(page);

    const result = await page.evaluate(async () => {
      (window as any).appPrompt = async () => 'randomize';
      const poolsBefore = state.teams.map((t: any) => t.pool);
      await randomizePools();
      return JSON.stringify(poolsBefore) === JSON.stringify(state.teams.map((t: any) => t.pool));
    });

    expect(result).toBe(true);
  });
});
