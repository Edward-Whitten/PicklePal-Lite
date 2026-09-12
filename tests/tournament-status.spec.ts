import { expect, test } from '@playwright/test';
import { seedTournament, tournamentState } from './fixtures';

// index.html is a classic script: `state` is a global lexical binding
// reachable as a bare identifier, but NOT as window.state.
declare const state: any;
declare function startTournament(): Promise<void>;
declare function pauseTournament(): Promise<void>;
declare function deepEditsAllowed(): boolean;
declare function generateBracket(): Promise<void>;
declare function randomizePools(): Promise<void>;
declare function markNoShow(id: number, missingKey: 'p1' | 'p2'): Promise<void>;
declare function finalizePoolMatch(mId: string, id1: number, id2: number, s1: number, s2: number, resolvedBy?: string): void;

function readyToStartState() {
  const base = tournamentState();
  return {
    ...base,
    poolCount: 1,
    poolSchedule: [{ pool: 0, rounds: [] }],
    completedMatches: {
      'm-1-2': { s1: 11, s2: 7, teamAId: 1, teamBId: 2, status: 'confirmed', resolvedBy: 'teams', resolvedAt: new Date().toISOString(), correctedFrom: null },
    },
  } as ReturnType<typeof tournamentState>;
}

async function openManager(page: import('@playwright/test').Page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof startTournament === 'function');
}

async function openCompetitionPools(page: import('@playwright/test').Page) {
  const mobile = (await page.viewportSize())!.width <= 640;
  await (mobile ? page.locator('#mob-nav-pools') : page.getByRole('button', { name: 'Competition' })).click();
}

test.describe('Tournament status controls and edit-lock enforcement', () => {
  test.beforeEach(async ({ page }) => {
    await seedTournament(page, { manager: true, state: readyToStartState() });
  });

  test('status badge and Start/Pause buttons reflect status transitions', async ({ page }) => {
    await openManager(page);
    await openCompetitionPools(page);

    await expect(page.locator('#tournament-status-badge')).toHaveText('Setup');
    await expect(page.locator('#tournament-start-btn')).toBeVisible();
    await expect(page.locator('#tournament-pause-btn')).toBeHidden();

    await page.evaluate(() => { (window as any).appConfirm = async () => true; (window as any).appAlert = async () => true; });
    await page.locator('#tournament-start-btn').click();

    await expect(page.locator('#tournament-status-badge')).toHaveText('Active');
    await expect(page.locator('#tournament-start-btn')).toBeHidden();
    await expect(page.locator('#tournament-pause-btn')).toBeVisible();

    await page.locator('#tournament-pause-btn').click();
    await expect(page.locator('#tournament-status-badge')).toHaveText('Paused');
    await expect(page.locator('#tournament-start-btn')).toBeVisible();
    await expect(page.locator('#tournament-pause-btn')).toBeHidden();
  });

  test('starting without pools generated is blocked', async ({ page }) => {
    await openManager(page);

    const result = await page.evaluate(async () => {
      state.poolCount = 0;
      state.poolSchedule = [];
      let alertTitle = '';
      (window as any).appAlert = async (msg: string, title: string) => { alertTitle = title; return true; };
      await startTournament();
      return { status: state.status, alertTitle };
    });

    expect(result.status).toBe('setup');
    expect(result.alertTitle).toBe('Not Ready');
  });

  test('deep edits are blocked while active and unlocked again after pause', async ({ page }) => {
    await openManager(page);

    const result = await page.evaluate(async () => {
      (window as any).appConfirm = async () => true;
      (window as any).appAlert = async () => true;
      await startTournament();
      const lockedDuringActive = !deepEditsAllowed();
      const bracketDisabledDuringActive = (document.getElementById('seed-bracket-btn') as HTMLButtonElement).disabled;
      const csvDisabledDuringActive = (document.getElementById('csv-upload') as HTMLButtonElement).disabled;

      await pauseTournament();
      const unlockedAfterPause = deepEditsAllowed();

      return {
        status: state.status,
        lockedDuringActive,
        bracketDisabledDuringActive,
        csvDisabledDuringActive,
        unlockedAfterPause,
        bracketEnabledAfterPause: !(document.getElementById('seed-bracket-btn') as HTMLButtonElement).disabled,
      };
    });

    expect(result.lockedDuringActive).toBe(true);
    expect(result.bracketDisabledDuringActive).toBe(true);
    expect(result.csvDisabledDuringActive).toBe(true);
    expect(result.unlockedAfterPause).toBe(true);
    expect(result.status).toBe('paused');
    expect(result.bracketEnabledAfterPause).toBe(true);
  });

  test('pausing to edit teams and re-seed the bracket does not regress pool play scores', async ({ page }) => {
    await openManager(page);

    const result = await page.evaluate(async () => {
      (window as any).appConfirm = async () => true;
      (window as any).appAlert = async () => true;
      await startTournament();
      await pauseTournament();

      const scoresBeforeEdit = JSON.parse(JSON.stringify(state.completedMatches));
      await markNoShow(3, 'p1');
      const scoresAfterEdit = state.completedMatches;

      return {
        status: state.status,
        scoreCountBefore: Object.keys(scoresBeforeEdit).length,
        scoreCountAfter: Object.keys(scoresAfterEdit).length,
        matchStillIntact: JSON.stringify(scoresBeforeEdit['m-1-2']) === JSON.stringify(scoresAfterEdit['m-1-2']),
        team3Inactive: !state.teams.find((t: any) => t.id === 3).active,
      };
    });

    expect(result.status).toBe('paused');
    expect(result.scoreCountBefore).toBe(1);
    expect(result.scoreCountAfter).toBe(1);
    expect(result.matchStillIntact).toBe(true);
    expect(result.team3Inactive).toBe(true);
  });
});
