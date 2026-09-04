import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, seedTournament, tournamentCode } from './fixtures';

async function openManagerTab(page: import('@playwright/test').Page, tab: 'roster' | 'pools') {
  const mobile = (await page.viewportSize())!.width <= 640;
  await (mobile ? page.locator(tab === 'roster' ? '#mob-nav-roster' : '#mob-nav-pools') : page.getByRole('button', { name: tab === 'roster' ? 'Check-In' : 'Pool Play' })).click();
}

test.describe('Home and manager workspace', () => {
  test('Home access is scrollable, code-first, and opens manager PIN toast', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.getByRole('heading', { name: 'One-Word Tournament Code' })).toBeVisible();
    await expect(page.getByLabel('Four-digit manager PIN')).toBeHidden();
    await page.locator('#lobby-nickname').fill(tournamentCode);
    await page.getByRole('button', { name: 'Manager' }).click();
    await expect(page.getByLabel('Four-digit manager PIN')).toBeVisible();
    await expect(page.getByLabel('Four-digit manager PIN')).toBeFocused();
    expect(await expectNoHorizontalOverflow(page)).toBe(true);
  });

  test('restores a manager session with roster and touch-sized check-in controls', async ({ page }) => {
    await seedTournament(page, { manager: true });
    await page.goto('/index.html');
    await expect(page.locator('#head-title')).toHaveValue('E2E Tournament');
    await openManagerTab(page, 'roster');
    await expect(page.locator('#roster-list .team-row-entry')).toHaveCount(4);
    const controls = page.getByRole('button', { name: 'Here' });
    await expect(controls).toHaveCount(4);
    const size = await controls.first().evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
    expect(await expectNoHorizontalOverflow(page)).toBe(true);
  });

  test('generates a four-team pool and preserves score validation', async ({ page }) => {
    await seedTournament(page, { manager: true });
    await page.goto('/index.html');
    await openManagerTab(page, 'pools');
    await expect(page.locator('#pool-container .match-card')).toHaveCount(6);
    const first = page.locator('#pool-container .match-card').first();
    await first.locator('input[id^="s1-"]').fill('10');
    await first.locator('input[id^="s2-"]').fill('8');
    await first.getByRole('button', { name: 'Confirm Score' }).click();
    await expect(page.locator('#modal-title')).toHaveText('Invalid Score');
    await page.keyboard.press('Escape');
    await expect(page.locator('#app-modal')).not.toHaveClass(/active/);
  });
});