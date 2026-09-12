import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, seedTournament, tournamentCode } from './fixtures';

async function openRosterTab(page: import('@playwright/test').Page) {
  const mobile = (await page.viewportSize())!.width <= 640;
  await (mobile ? page.locator('#mob-nav-roster') : page.getByRole('button', { name: 'Check-In' })).click();
}

test.describe('Live status badge stays pinned to the top', () => {
  test('sync-status is fixed-positioned near the top on manager and player pages', async ({ page }) => {
    await seedTournament(page, { manager: true });
    await page.goto('/index.html');
    await expect(page.locator('#sync-status')).toBeAttached();
    const managerBadge = await page.locator('#sync-status').evaluate(el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return { position: style.position, top: rect.top };
    });
    expect(managerBadge.position).toBe('fixed');
    expect(managerBadge.top).toBeGreaterThanOrEqual(0);
    expect(managerBadge.top).toBeLessThan(120);

    await page.goto(`/players.html?event=${tournamentCode}`);
    const playerBadge = await page.locator('#sync-status').evaluate(el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return { position: style.position, top: rect.top };
    });
    expect(playerBadge.position).toBe('fixed');
    expect(playerBadge.top).toBeGreaterThanOrEqual(0);
    expect(playerBadge.top).toBeLessThan(120);
  });
});

test.describe('Check-in row layout at tablet portrait', () => {
  test('pool select and check-in button stay fully on-screen without horizontal scroll', async ({ page }) => {
    await seedTournament(page, { manager: true });
    await page.goto('/index.html');
    await openRosterTab(page);
    await expect(page.locator('.team-row-entry').first()).toBeVisible();

    expect(await expectNoHorizontalOverflow(page)).toBe(true);

    const overflow = await page.locator('.team-row-entry .check-in-control').first().evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { right: rect.right, viewportWidth: window.innerWidth, width: rect.width };
    });
    expect(overflow.right).toBeLessThanOrEqual(overflow.viewportWidth + 1);
    expect(overflow.width).toBeGreaterThan(0);
  });
});
