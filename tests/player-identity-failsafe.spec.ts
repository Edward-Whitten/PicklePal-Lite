import { expect, test } from '@playwright/test';
import { playerAPin, playerBPin, seedTournament, tournamentCode } from './fixtures';

async function choosePlayerRole(page: import('@playwright/test').Page) {
  await expect(page.getByRole('region', { name: 'Choose portal role' })).toBeVisible();
  await page.getByRole('button', { name: /Player/ }).click();
}

test.describe('Player identity failsafe', () => {
  test('an identified player cannot switch the score desk to a different team\'s PIN', async ({ page }) => {
    await seedTournament(page, { player: true });
    await page.addInitScript(({ code }) => {
      const key = `picklepal_tournament_${code}`;
      const state = JSON.parse(localStorage.getItem(key)!);
      state.teams = state.teams.map((team: any) => team.id === 1 ? { ...team, checkedIn: false, p1CheckedIn: false, p2CheckedIn: false } : team);
      localStorage.setItem(key, JSON.stringify(state));
    }, { code: tournamentCode });
    await page.goto(`/players.html?event=${tournamentCode}`);
    await choosePlayerRole(page);

    // Identify as a player on team 1 via the express check-in name search.
    await page.getByLabel('Search your name').fill('Alexandra Verylonglastname');
    await page.locator('#express-player-directory').getByRole('button', { name: 'Check In Me' }).click();
    await expect(page.locator('#player-identity-banner')).toContainText('Alexandra Verylonglastname');

    // Attempting to unlock the score desk with team 2's PIN must be rejected, not silently switch teams.
    await page.getByLabel('4-digit player PIN').fill(playerBPin);
    await page.getByRole('button', { name: 'Unlock scores' }).click();
    await expect(page.locator('#player-pin-message')).toContainText('Unauthorized: This code does not match your registered team.');
    await expect(page.getByRole('heading', { name: 'Cameron Sample & Devon Player' })).toBeHidden();

    // Their own team's PIN still works normally.
    await page.getByLabel('4-digit player PIN').fill(playerAPin);
    await page.getByRole('button', { name: 'Unlock scores' }).click();
    await expect(page.getByRole('heading', { name: 'Alexandra Verylonglastname & Benjamin Example' })).toBeVisible();
  });
});
