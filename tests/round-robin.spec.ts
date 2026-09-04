import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow } from './fixtures';

test.describe('Round Robin workspace', () => {
  test('opens dedicated RR route with resilient mobile-safe controls', async ({ page }) => {
    await page.goto('/rr.html');
    await expect(page).toHaveURL(/index\.html\?mode=round-robin/);
    await expect(page.getByRole('heading', { name: 'Round Robin Play' })).toBeVisible();
    await expect(page.locator('[data-rr-sync-banner]').first()).toContainText(/Live Sync Active|Offline Mode - Local Storage Active/);
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
});
