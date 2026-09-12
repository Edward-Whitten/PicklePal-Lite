import { expect, test } from '@playwright/test';
import { seedTournament, tournamentState } from './fixtures';

async function openManager(page: import('@playwright/test').Page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof forceEnterScore === 'function');
}

async function openCompetitionPools(page: import('@playwright/test').Page) {
  const mobile = (await page.viewportSize())!.width <= 640;
  await (mobile ? page.locator('#mob-nav-pools') : page.getByRole('button', { name: 'Competition' })).click();
}

declare function forceEnterScore(mId: string, id1: number, id2: number): Promise<void>;
declare const state: any;

function stateWithPendingReport() {
  const base = tournamentState();
  return {
    ...base,
    scoreReports: {
      'm-1-2': { teamA: { s1: 11, s2: 7, teamId: 1, submittedAt: new Date().toISOString() } },
    },
  } as ReturnType<typeof tournamentState>;
}

test.describe('Manager score override', () => {
  test.beforeEach(async ({ page }) => {
    await seedTournament(page, { manager: true, state: stateWithPendingReport() });
  });

  test('Force Enter Score button is shown for a one-sided pending report', async ({ page }) => {
    await openManager(page);
    await openCompetitionPools(page);
    await expect(page.getByText('AWAITING BOTH TEAM REPORTS')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Force Enter Score' })).toBeVisible();
  });

  test('forceEnterScore locks in a final score and clears the pending report', async ({ page }) => {
    await openManager(page);

    const result = await page.evaluate(async () => {
      (window as any).appConfirm = async () => true;
      (window as any).appPrompt = async () => '11-9';
      await forceEnterScore('m-1-2', 1, 2);
      return {
        completed: state.completedMatches['m-1-2'],
        reportGone: !state.scoreReports['m-1-2'],
      };
    });

    expect(result.completed).toMatchObject({ s1: 11, s2: 9, teamAId: 1, teamBId: 2, resolvedBy: 'admin-override' });
    expect(result.reportGone).toBe(true);
  });

  test('forceEnterScore does nothing if the manager declines the confirmation', async ({ page }) => {
    await openManager(page);

    const result = await page.evaluate(async () => {
      (window as any).appConfirm = async () => false;
      await forceEnterScore('m-1-2', 1, 2);
      return { completed: state.completedMatches['m-1-2'], reportStillThere: Boolean(state.scoreReports['m-1-2']) };
    });

    expect(result.completed).toBeUndefined();
    expect(result.reportStillThere).toBe(true);
  });

  test('forceEnterScore rejects an invalid (tied) score', async ({ page }) => {
    await openManager(page);

    const result = await page.evaluate(async () => {
      (window as any).appConfirm = async () => true;
      (window as any).appPrompt = async () => '10-10';
      let alertTitle = '';
      (window as any).appAlert = async (msg: string, title: string) => { alertTitle = title; return true; };
      await forceEnterScore('m-1-2', 1, 2);
      return { alertTitle, completed: state.completedMatches['m-1-2'] };
    });

    expect(result.alertTitle).toBe('Invalid Score');
    expect(result.completed).toBeUndefined();
  });
});
