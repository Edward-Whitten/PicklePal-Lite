import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, playerAPin, seedTournament, tournamentCode } from './fixtures';

test.describe('Player and spectator portal', () => {
  test('unlocks a player desk and exposes mobile-safe score entry', async ({ page }) => {
    await seedTournament(page, { player: true });
    await page.goto(`/players.html?event=${tournamentCode}`);
    await expect(page.locator('#event-tabs')).not.toHaveClass(/hidden/);
    await page.getByLabel('4-digit player PIN').fill(playerAPin);
    await page.getByRole('button', { name: 'Unlock scores' }).click();
    await expect(page.getByRole('heading', { name: 'Alexandra Verylonglastname & Benjamin Example' })).toBeVisible();
    await expect(page.getByLabel('Your score').first()).toBeVisible();
    await expect(page.getByLabel('Opponent').first()).toBeVisible();
    expect(await expectNoHorizontalOverflow(page)).toBe(true);
  });

  test('shows public pool standings and keeps tab changes in place', async ({ page }) => {
    await seedTournament(page, { player: true });
    await page.goto(`/players.html?event=${tournamentCode}`);
    await expect(page.locator('#event-tabs')).not.toHaveClass(/hidden/);
    await page.getByRole('button', { name: 'Pools', exact: true }).click();
    await expect(page.getByRole('button', { name: 'A', exact: true })).toBeVisible();
    await expect(page.locator('#public-pools .pool-row')).toHaveCount(5);
    await page.evaluate(() => window.scrollTo(0, 200));
    const before = await page.evaluate(() => window.scrollY);
    await page.getByRole('button', { name: 'Standings', exact: true }).click();
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});