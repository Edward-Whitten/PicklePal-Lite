import { expect, test } from '@playwright/test';
import { managerPin, seedTournament, tournamentCode } from './fixtures';

const breakpoints = [320, 375, 768, 1024, 1280];

async function noHorizontalOverflow(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
}

async function interactiveTargetsFit(page: import('@playwright/test').Page) {
  return page.locator('button:visible, a:visible, input:visible, select:visible').evaluateAll(elements => elements.every(element => {
    const rect = element.getBoundingClientRect();
    return rect.width >= 44 && rect.height >= 44;
  }));
}

test.describe('visual hardening breakpoints', () => {
  for (const width of breakpoints) {
    test(`manager competition has no unintended overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width <= 375 ? 844 : 900 });
      await seedTournament(page, { manager: true });
      await page.goto('/index.html');
      const mobile = width <= 640;
      await (mobile ? page.locator('#mob-nav-pools').click() : page.getByRole('button', { name: 'Competition' }).click());
      await expect(page.locator('#tab-competition')).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
      expect(await interactiveTargetsFit(page)).toBe(true);
    });

    test(`player overview has no unintended overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width <= 375 ? 844 : 900 });
      await seedTournament(page, { player: true });
      await page.goto(`/players.html?event=${tournamentCode}`);
      await page.getByRole('button', { name: /Player/ }).click();
      await expect(page.getByRole('heading', { name: 'Submit a match score' })).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
      expect(await interactiveTargetsFit(page)).toBe(true);
    });

    test(`manager setup modal remains contained at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width <= 375 ? 844 : 900 });
      await page.goto('/index.html');
      await page.getByRole('button', { name: 'Setup new tournament' }).click();
      await expect(page.locator('#setup-wizard')).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
      await page.getByRole('button', { name: 'Close setup wizard' }).click();
      await page.locator('#lobby-nickname').fill(tournamentCode);
      await page.getByRole('button', { name: 'Manager' }).click();
      await page.getByLabel('Four-digit manager PIN').fill(managerPin);
      expect(await noHorizontalOverflow(page)).toBe(true);
    });
  }
});