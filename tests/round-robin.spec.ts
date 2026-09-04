import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow } from './fixtures';

test.describe('Round Robin workspace', () => {
  test('opens dedicated RR route with resilient mobile-safe controls', async ({ page }) => {
    await page.goto('/rr.html');
    await expect(page).toHaveURL(/index\.html\?mode=round-robin/);
    await expect(page.locator('link[rel="icon"][href="assets/logo.png"]')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Round Robin Play' })).toBeVisible();
    await expect(page.locator('[data-rr-sync-banner]')).toHaveCount(0);
    await expect(page.getByLabel('One-word Round Robin Code')).toBeVisible();
    await expect(page.locator('.rr-match-scroll')).toHaveCount(1);
    await expect(page.locator('.rr-table-scroll')).toHaveCount(1);

    const touchTargetsOk = await page.locator('#tab-rr-setup .btn, #tab-rr-setup input, #tab-rr-setup select, .param-btn').evaluateAll(elements => elements
      .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
      .every(element => {
        const rect = element.getBoundingClientRect();
        return rect.width >= 44 && rect.height >= 44;
      }));
    expect(touchTargetsOk).toBe(true);
    expect(await expectNoHorizontalOverflow(page)).toBe(true);
  });

  test('uses manager chosen RR codes and shows active-code conflicts inline', async ({ page }) => {
    await page.route('**/functions/v1/tournament-api', async route => {
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'That tournament code is already in use.' }) });
    });
    await page.goto('/rr.html');
    await page.getByLabel('One-word Round Robin Code').fill('smash');
    await page.locator('#rr-admin-pin').fill('1234');
    await page.getByRole('button', { name: 'Create event' }).click();
    await expect(page.locator('#rr-event-message')).toHaveText('That event code is currently active. Please choose another word.');
  });
});
