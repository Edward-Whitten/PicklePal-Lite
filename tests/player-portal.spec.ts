import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, playerAPin, seedTournament, tournamentCode } from './fixtures';

async function choosePlayerRole(page: import('@playwright/test').Page) {
  await expect(page.getByRole('region', { name: 'Choose portal role' })).toBeVisible();
  await page.getByRole('button', { name: /Player/ }).click();
}

test.describe('Player and spectator portal', () => {
  test('direct QR event links require an explicit role choice and do not inherit stale spectator mode', async ({ page }) => {
    await seedTournament(page, { player: true });
    await page.addInitScript(() => localStorage.setItem('picklepal_portal_role', 'spectator'));
    await page.goto(`/players.html?event=${tournamentCode}`);
    await expect(page.getByRole('region', { name: 'Choose portal role' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Submit a match score' })).toBeHidden();
    await page.getByRole('button', { name: /Player/ }).click();
    await expect(page.getByRole('heading', { name: 'Submit a match score' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Express Player Check-In' })).toBeVisible();
  });

  test('unlocks a player desk and exposes mobile-safe score entry', async ({ page }) => {
    await seedTournament(page, { player: true });
    await page.goto(`/players.html?event=${tournamentCode}`);
    await expect(page.locator('#event-tabs')).not.toHaveClass(/hidden/);
    await choosePlayerRole(page);
    await page.getByLabel('4-digit player PIN').fill(playerAPin);
    await page.getByRole('button', { name: 'Unlock scores' }).click();
    await expect(page.getByRole('heading', { name: 'Alexandra Verylonglastname & Benjamin Example' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Express Player Check-In' })).toBeVisible();
    await expect(page.getByLabel('Your score').first()).toBeVisible();
    await expect(page.getByLabel('Opponent').first()).toBeVisible();
    const touchTargets = await page.locator('#player-pin-input, #player-pin-submit, .score-box, .score-submit').evaluateAll(elements => elements.every(element => {
      const rect = element.getBoundingClientRect();
      return rect.width >= 44 && rect.height >= 44;
    }));
    expect(touchTargets).toBe(true);
    expect(await expectNoHorizontalOverflow(page)).toBe(true);
  });

  test('lets individual players check in by name and receive their score PIN', async ({ page }) => {
    await seedTournament(page, { player: true });
    await page.addInitScript(({ code }) => {
      const key = `picklepal_tournament_${code}`;
      const state = JSON.parse(localStorage.getItem(key)!);
      state.teams = state.teams.map((team: any) => team.id === 1 ? { ...team, checkedIn: false, p1CheckedIn: false, p2CheckedIn: false } : team);
      localStorage.setItem(key, JSON.stringify(state));
    }, { code: tournamentCode });
    await page.goto(`/players.html?event=${tournamentCode}`);
    await expect(page.locator('#event-tabs')).not.toHaveClass(/hidden/);
    await choosePlayerRole(page);
    await expect(page.getByRole('region', { name: 'Express Player Check-In' })).toBeVisible();
    await page.getByLabel('Search your name').fill('a');
    await expect(page.locator('#express-player-directory').getByRole('button', { name: 'Check In Me' })).toHaveCount(0);
    await page.getByLabel('Search your name').fill('Alexandra Verylonglastname');
    await expect(page.locator('#express-player-directory .player-checkin-row')).toHaveCount(1);
    const checkInButton = page.locator('#express-player-directory').getByRole('button', { name: 'Check In Me' });
    await expect(checkInButton).toBeVisible();
    const checkInButtonSize = await checkInButton.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(checkInButtonSize.width).toBeGreaterThanOrEqual(44);
    expect(checkInButtonSize.height).toBeGreaterThanOrEqual(44);
    await checkInButton.click();
    await expect(page.locator('#express-pin-delivery')).toContainText("Thanks for checking in, Alexandra! You're ready to play.");
    await expect(page.locator('#express-pin-delivery')).toContainText(`YOUR MATCH SCORE PIN: ${playerAPin}`);
    await expect(page.locator('#player-identity-banner')).toContainText('Logged in as');
    await expect(page.locator('#player-identity-banner')).toContainText('Alexandra Verylonglastname');
    await expect(page.locator('#express-player-directory')).toContainText('Checked In');
    const storedFirst = await page.evaluate(code => {
      const team = JSON.parse(localStorage.getItem(`picklepal_tournament_${code}`)!).teams.find((item: any) => item.id === 1);
      return { p1CheckedIn: team.p1CheckedIn, p2CheckedIn: team.p2CheckedIn, checkedIn: team.checkedIn };
    }, tournamentCode);
    expect(storedFirst).toEqual({ p1CheckedIn: true, p2CheckedIn: false, checkedIn: false });
    await page.getByRole('button', { name: 'Pools', exact: true }).click();
    await expect(page.locator('#public-pools .checkin-pill').first()).toContainText('Ready');
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await page.getByLabel('Search your name').fill('Benjamin Example');
    await page.locator('#express-player-directory').getByRole('button', { name: 'Check In Me' }).click();
    await expect(page.locator('#express-pin-delivery')).toContainText("Thanks for checking in, Benjamin! You're ready to play.");
    const storedBoth = await page.evaluate(code => {
      const team = JSON.parse(localStorage.getItem(`picklepal_tournament_${code}`)!).teams.find((item: any) => item.id === 1);
      return { p1CheckedIn: team.p1CheckedIn, p2CheckedIn: team.p2CheckedIn, checkedIn: team.checkedIn };
    }, tournamentCode);
    expect(storedBoth).toEqual({ p1CheckedIn: true, p2CheckedIn: true, checkedIn: true });
    await page.getByRole('button', { name: 'Go to Score Desk' }).click();
    await expect(page.getByLabel('4-digit player PIN')).toHaveValue(playerAPin);
    await expect(page.getByRole('heading', { name: 'Alexandra Verylonglastname & Benjamin Example' })).toBeVisible();
    await page.getByRole('button', { name: 'Exit Score Desk' }).click();
    await expect(page.locator('#player-dashboard')).toHaveClass(/hidden/);
    await expect(page.getByLabel('4-digit player PIN')).toHaveValue('');
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
    await choosePlayerRole(page);
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
    const contrast = await page.locator('#score-confirm-value').evaluate(element => {
      const style = getComputedStyle(element);
      return { color: style.color, background: getComputedStyle(document.querySelector('#score-confirm-overlay')!).backgroundColor };
    });
    expect(contrast.color).toBe('rgb(248, 250, 252)');
    await page.keyboard.press('Escape');
    await expect(page.locator('#score-confirm-overlay')).not.toHaveClass(/active/);
    await firstCard.getByRole('button', { name: 'Submit final score' }).click();
    await page.getByRole('button', { name: 'Submit score' }).click();
    await expect(firstCard.locator('.score-status.waiting')).toContainText('Awaiting Confirmation');
    expect(dialogs).toHaveLength(0);
  });

  test('player identity cannot check in a different player by payload tampering', async ({ page }) => {
    await seedTournament(page, { player: true });
    await page.goto(`/players.html?event=${tournamentCode}`);
    await choosePlayerRole(page);
    const message = await page.evaluate(async () => {
      await window.functions.httpsCallable('playerIdentify')({ tournament: 'e2echeck', playerName: 'Alexandra Verylonglastname' });
      try {
        await window.functions.httpsCallable('checkInPlayer')({ tournament: 'e2echeck', teamId: 2, playerSlot: 'p1' });
      } catch (error: any) {
        return error.message;
      }
      return '';
    });
    expect(message).toContain('Players can only check in themselves');
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