import { expect, test } from '@playwright/test';
import { seedTournament, tournamentState } from './fixtures';

// index.html is a classic script: `state` is a global lexical binding
// reachable as a bare identifier, but NOT as window.state.
declare const state: any;
declare function generateBracket(): Promise<void>;
declare function renderCompetitionSummary(): void;
declare function pauseTournament(): Promise<void>;

const POOL_COUNT = 6;
const TEAMS_PER_POOL = 5;

// 6 pools x 5 teams = 30 teams, all pool play already final (0 open reports), tournament still active --
// mirrors the reported bug: pool play finished mid-simulation but the bracket wouldn't generate.
function readyForBracketState(overrides: Record<string, unknown> = {}) {
  const base = tournamentState();
  const teams = [];
  const completedMatches: Record<string, unknown> = {};
  for (let pool = 0; pool < POOL_COUNT; pool++) {
    const poolTeamIds: number[] = [];
    for (let slot = 0; slot < TEAMS_PER_POOL; slot++) {
      const id = pool * TEAMS_PER_POOL + slot + 1;
      const wins = TEAMS_PER_POOL - 1 - slot;
      const losses = slot;
      const pd = wins * 10 + (POOL_COUNT - pool);
      poolTeamIds.push(id);
      teams.push({
        id, pin: String(1000 + id), p1: `Pool${pool + 1} Player${slot + 1}A`, p2: `Pool${pool + 1} Player${slot + 1}B`,
        checkedIn: true, pool, wins, losses, pf: 11 * wins + pd, pa: 11 * losses, pd, active: true,
      });
    }
    for (let a = 0; a < poolTeamIds.length; a++) {
      for (let b = a + 1; b < poolTeamIds.length; b++) {
        completedMatches[`m-${poolTeamIds[a]}-${poolTeamIds[b]}`] = { s1: 11, s2: 7, teamAId: poolTeamIds[a], teamBId: poolTeamIds[b], status: 'confirmed', resolvedBy: 'teams', resolvedAt: new Date().toISOString() };
      }
    }
  }
  return {
    ...base,
    expectedTeams: teams.length,
    advancementCount: 20,
    poolCount: POOL_COUNT,
    teams,
    completedMatches,
    scoreReports: {},
    status: 'active',
    tournamentStarted: true,
    ...overrides,
  } as ReturnType<typeof tournamentState>;
}

async function openManager(page: import('@playwright/test').Page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof generateBracket === 'function');
}

async function openBracketTab(page: import('@playwright/test').Page) {
  const mobile = (await page.viewportSize())!.width <= 640;
  await (mobile ? page.locator('#mob-nav-pools') : page.getByRole('button', { name: 'Competition' })).click();
  await page.locator('#competition-tab-bracket').click();
}

test.describe('Pool play to bracket play transition', () => {
  test('Generate Bracket succeeds while the tournament is active once pool play is complete', async ({ page }) => {
    await seedTournament(page, { manager: true, state: readyForBracketState() });
    await openManager(page);

    const result = await page.evaluate(async () => {
      (window as any).appAlert = async () => true;
      (window as any).appConfirm = async () => true;
      await generateBracket();
      const r32 = state.bracket.r32 as Array<{ t1: any; t2: any }>;
      return {
        status: state.status,
        seededCount: r32.reduce((n: number, m: any) => n + (m.t1 ? 1 : 0) + (m.t2 ? 1 : 0), 0),
        poolMatchesIntact: Object.keys(state.completedMatches).length,
      };
    });

    expect(result.status).toBe('active');
    expect(result.seededCount).toBe(20);
    expect(result.poolMatchesIntact).toBe(60);
  });

  test('the Generate Bracket button and banner reflect pool-play readiness', async ({ page }) => {
    await seedTournament(page, { manager: true, state: readyForBracketState({ scoreReports: { 'm-1-2': { teamA: { s1: 11, s2: 9, teamId: 1 } } } }) });
    await openManager(page);
    await openBracketTab(page);

    await expect(page.locator('#seed-bracket-btn')).toBeDisabled();
    await expect(page.locator('#bracket-readiness-hint')).toBeVisible();
    await expect(page.locator('#bracket-readiness-hint')).toContainText('1 pool match report still open');

    await page.evaluate(() => { state.scoreReports = {}; renderCompetitionSummary(); });
    await expect(page.locator('#seed-bracket-btn')).toBeEnabled();
    await expect(page.locator('#bracket-readiness-hint')).toBeHidden();
  });

  test('re-seeding an already-seeded bracket is blocked while active but allowed after pausing', async ({ page }) => {
    await seedTournament(page, { manager: true, state: readyForBracketState() });
    await openManager(page);

    const result = await page.evaluate(async () => {
      (window as any).appAlert = async () => true;
      (window as any).appConfirm = async () => true;
      await generateBracket(); // first-time generation, allowed while active
      const seedAfterFirst = state.bracket.r32.map((m: any) => m.t1?.id ?? null);

      let blockedTitle = '';
      (window as any).appAlert = async (msg: string, title: string) => { blockedTitle = title; return true; };
      await generateBracket(); // re-seed attempt while still active and bracket already has bye results
      const capturedBlockedTitle = blockedTitle;

      (window as any).appConfirm = async () => true;
      (window as any).appAlert = async () => true;
      await pauseTournament();
      await generateBracket(); // re-seed while paused should now succeed

      return { blockedTitle: capturedBlockedTitle, statusAfterPause: state.status, archived: Boolean(state.bracketArchive) };
    });

    expect(result.blockedTitle).toBe('Tournament Active');
    expect(result.statusAfterPause).toBe('paused');
    expect(result.archived).toBe(true);
  });
});
