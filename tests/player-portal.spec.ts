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
    const touchTargets = await page.locator('#player-pin-input, #player-pin-submit, .score-box, .score-submit').evaluateAll(elements => elements.every(element => {
      const rect = element.getBoundingClientRect();
      return rect.width >= 44 && rect.height >= 44;
    }));
    expect(touchTargets).toBe(true);
    expect(await expectNoHorizontalOverflow(page)).toBe(true);
  });

  test('validates PIN and score entry without blocking dialogs', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', async dialog => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await seedTournament(page, { player: true });
    await page.goto(`/players.html?event=${tournamentCode}`);
    await expect(page.locator('#event-tabs')).not.toHaveClass(/hidden/);
    await page.getByLabel('4-digit player PIN').fill('9999');
    await page.getByRole('button', { name: 'Unlock scores' }).click();
    await expect(page.locator('#player-pin-message')).toContainText('does not match this tournament');
    await page.getByLabel('4-digit player PIN').fill(playerAPin);
    await page.getByRole('button', { name: 'Unlock scores' }).click();
    const firstCard = page.locator('.player-match-card').first();
    await firstCard.getByLabel('Your score').fill('10');
    await firstCard.getByLabel('Opponent').fill('8');
    await firstCard.getByRole('button', { name: 'Submit final score' }).click();
    await expect(firstCard.locator('.score-error')).toContainText('won by 2');
    await firstCard.getByLabel('Your score').fill('11');
    await firstCard.getByLabel('Opponent').fill('7');
    await firstCard.getByRole('button', { name: 'Submit final score' }).click();
    await expect(page.locator('#score-confirm-overlay')).toHaveClass(/active/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#score-confirm-overlay')).not.toHaveClass(/active/);
    await firstCard.getByRole('button', { name: 'Submit final score' }).click();
    await page.getByRole('button', { name: 'Submit score' }).click();
    await expect(firstCard.locator('.score-status.waiting')).toContainText('Awaiting Confirmation');
    expect(dialogs).toHaveLength(0);
  });

  test('shows public pool standings and keeps tab changes in place', async ({ page }) => {
    await seedTournament(page, { player: true });
    await page.goto(`/players.html?event=${tournamentCode}`);
    await expect(page.locator('#event-tabs')).not.toHaveClass(/hidden/);
    await page.getByRole('button', { name: 'Pools', exact: true }).click();
    await expect(page.getByRole('button', { name: 'A', exact: true })).toBeVisible();
    await expect(page.locator('#public-pools .pool-row')).toHaveCount(5);
    await expect(page.locator('#public-pools .swipe-surface')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 200));
    const before = await page.evaluate(() => window.scrollY);
    await page.getByRole('button', { name: 'Standings', exact: true }).click();
    await expect(page.locator('#public-standings .swipe-surface')).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});