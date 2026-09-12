import { expect, test } from '@playwright/test';
import { seedTournament, tournamentState } from './fixtures';

// index.html is a classic script: `let state` is a global lexical binding
// reachable as a bare identifier, but NOT as window.state.
declare const state: any;
declare function generateBracket(): Promise<void>;
declare function tournamentQualification(): any;
declare function renderStructureControls(): void;
declare function advR32(index: number, teamNum: number): void;

const POOL_COUNT = 6;
const TEAMS_PER_POOL = 5;

// 6 pools x 5 teams = 30 teams. Wins descend within each pool so pool ranks are deterministic.
function sixPoolState() {
  const base = tournamentState();
  const teams = [];
  for (let pool = 0; pool < POOL_COUNT; pool++) {
    for (let slot = 0; slot < TEAMS_PER_POOL; slot++) {
      const id = pool * TEAMS_PER_POOL + slot + 1;
      const wins = TEAMS_PER_POOL - 1 - slot;
      const losses = slot;
      // Later pools get a slightly better differential so cross-pool ties break predictably.
      const pd = wins * 10 + (POOL_COUNT - pool);
      teams.push({
        id,
        pin: String(1000 + id),
        p1: `Pool${pool + 1} Player${slot + 1}A`,
        p2: `Pool${pool + 1} Player${slot + 1}B`,
        checkedIn: true,
        pool,
        wins,
        losses,
        pf: 11 * wins + pd,
        pa: 11 * losses,
        pd,
        active: true,
      });
    }
  }
  return {
    ...base,
    expectedTeams: teams.length,
    advancementCount: 20,
    poolCount: POOL_COUNT,
    teams,
  } as ReturnType<typeof tournamentState>;
}

async function openManager(page: import('@playwright/test').Page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof generateBracket === 'function');
}

test.describe('20-team preliminary round bracket', () => {
  test.beforeEach(async ({ page }) => {
    await seedTournament(page, { manager: true, state: sixPoolState() });
  });

  test('advancing options expose 20 teams', async ({ page }) => {
    await openManager(page);
    const values = await page.evaluate(() => {
      renderStructureControls();
      return Array.from(document.querySelectorAll('#advancing-teams-select option')).map(n => (n as HTMLOptionElement).value);
    });
    expect(values).toContain('20');
  });

  test('seeds 20 teams into 12 byes and 4 preliminary matches', async ({ page }) => {
    await openManager(page);

    const result = await page.evaluate(async () => {
      // Suppress modals so seeding runs unattended.
      (window as any).appAlert = async () => true;
      (window as any).appConfirm = async () => true;
      state.advancementCount = 20;
      await generateBracket();

      const r32 = state.bracket.r32 as Array<{ t1: any; t2: any; winner: number | null }>;
      const r16 = state.bracket.r16 as Array<{ t1: any; t2: any }>;
      const contested = r32.filter(m => m.t1 && m.t2);
      const byes = r32.filter(m => (m.t1 && !m.t2) || (!m.t1 && m.t2));

      return {
        advancementCount: state.advancementCount,
        seededTeams: r32.reduce((total, m) => total + (m.t1 ? 1 : 0) + (m.t2 ? 1 : 0), 0),
        contestedCount: contested.length,
        contestedPairs: contested.map(m => [m.t1.seed, m.t2.seed].sort((a: number, b: number) => a - b)),
        byeCount: byes.length,
        byesResolved: byes.every(m => m.winner !== null),
        r16Filled: r16.reduce((total, m) => total + (m.t1 ? 1 : 0) + (m.t2 ? 1 : 0), 0),
        teamCount: state.teams.length,
        completedMatchCount: Object.keys(state.completedMatches).length,
      };
    });

    expect(result.advancementCount).toBe(20);
    expect(result.seededTeams).toBe(20);
    // Seeds 13-20 meet in 4 matches; seeds 1-12 draw a bye.
    expect(result.contestedCount).toBe(4);
    expect(result.contestedPairs).toEqual(expect.arrayContaining([[13, 20], [14, 19], [15, 18], [16, 17]]));
    expect(result.byeCount).toBe(12);
    expect(result.byesResolved).toBe(true);
    // 12 byes land in the Round of 16 immediately, leaving 4 slots for prelim winners.
    expect(result.r16Filled).toBe(12);
    // Pool play data must survive bracket seeding untouched.
    expect(result.teamCount).toBe(POOL_COUNT * TEAMS_PER_POOL);
    expect(result.completedMatchCount).toBe(0);
  });

  test('qualifiers are the top 3 per pool plus the two best fourth-place teams', async ({ page }) => {
    await openManager(page);

    const qualifiers = await page.evaluate(() => {
      state.advancementCount = 20;
      const q = tournamentQualification();
      return {
        bracketSize: q.bracketSize,
        automaticPerPool: q.automaticPerPool,
        automaticCount: q.automatic.length,
        wildcardCount: q.wildcards.length,
        wildcardRanks: q.wildcards.map((entry: any) => entry.poolRank),
      };
    });

    expect(qualifiers.bracketSize).toBe(20);
    expect(qualifiers.automaticPerPool).toBe(3);
    expect(qualifiers.automaticCount).toBe(18);
    expect(qualifiers.wildcardCount).toBe(2);
    // Wildcards must come from the 4th-place tier, never a deeper placing.
    expect(qualifiers.wildcardRanks).toEqual([4, 4]);
  });

  test('re-seeding archives an in-progress bracket instead of dropping it', async ({ page }) => {
    await openManager(page);

    const archive = await page.evaluate(async () => {
      (window as any).appAlert = async () => true;
      (window as any).appConfirm = async () => true;
      state.advancementCount = 20;
      await generateBracket();

      // Record a preliminary result, then re-seed.
      const contestedIndex = state.bracket.r32.findIndex((m: any) => m.t1 && m.t2);
      advR32(contestedIndex, 1);
      const priorWinner = state.bracket.r32[contestedIndex].winner;

      await generateBracket();
      return {
        priorWinner,
        archived: Boolean(state.bracketArchive && state.bracketArchive.bracket),
        archivedAdvancement: state.bracketArchive?.advancementCount,
      };
    });

    expect(archive.priorWinner).toBe(1);
    expect(archive.archived).toBe(true);
    expect(archive.archivedAdvancement).toBe(20);
  });
});
