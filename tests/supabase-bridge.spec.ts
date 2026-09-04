import { expect, test } from '@playwright/test';
import { seedTournament } from './fixtures';

test.describe('Supabase bridge resilience', () => {
  test('retains manager recovery state when the tournament API is offline', async ({ page }) => {
    await seedTournament(page, { manager: true });
    await page.route('**/functions/v1/tournament-api', route => route.abort());
    await page.goto('/index.html');
    await expect(page.locator('#head-title')).toHaveValue('E2E Tournament');
    await expect(page.locator('#sync-status-text')).toHaveText('Not Live');
  });

  test('handles a delayed public API response without a page crash', async ({ page }) => {
    await seedTournament(page, { player: true });
    await page.route('**/functions/v1/tournament-api', async route => {
      await new Promise(resolve => setTimeout(resolve, 250));
      await route.abort();
    });
    await page.goto('/players.html');
    await expect(page.getByRole('heading', { name: 'PicklePal Lite' })).toBeVisible();
  });
});