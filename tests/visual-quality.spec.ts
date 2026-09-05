import { expect, test, type Page } from '@playwright/test';
import { playerAPin, seedTournament, tournamentCode } from './fixtures';

const breakpoints = [320, 375, 768, 1024, 1280];

function viewportHeight(width: number) {
  return width <= 375 ? 844 : width <= 768 ? 1024 : 900;
}

async function expectNoUnexpectedOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('body *')].map(element => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        id: element.id,
        className: String(element.className || ''),
        text: String(element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      };
    }).filter(item => item.right > window.innerWidth + 2 || item.left < -2).slice(0, 10),
  }));
  expect(overflow, JSON.stringify(overflow.offenders, null, 2)).toMatchObject({ scrollWidth: expect.any(Number) });
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewport + 2);
}

async function capture(page: Page, name: string) {
  await expectNoUnexpectedOverflow(page);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.03,
  });
}

async function openManager(page: Page, width: number) {
  await seedTournament(page, { manager: true });
  await page.setViewportSize({ width, height: viewportHeight(width) });
  await page.goto('/index.html');
  await expect(page.locator('#head-title')).toHaveValue('E2E Tournament');
}

async function openManagerCompetition(page: Page, width: number) {
  if (width <= 640) await page.locator('#mob-nav-pools').click();
  else await page.getByRole('button', { name: 'Competition' }).click();
  await expect(page.locator('#tab-competition')).toBeVisible();
}

async function openPlayer(page: Page, width: number) {
  await seedTournament(page, { player: true });
  await page.setViewportSize({ width, height: viewportHeight(width) });
  await page.goto(`/players.html?event=${tournamentCode}`);
  await expect(page.locator('#event-tabs')).not.toHaveClass(/hidden/);
}

test.describe('visual quality gates', () => {
  for (const width of breakpoints) {
    test(`manager critical views at ${width}px`, async ({ page }) => {
      await openManager(page, width);
      await capture(page, `manager-${width}-home`);

      if (width <= 640) await page.locator('#mob-nav-roster').click();
      else await page.getByRole('button', { name: 'Check-In' }).click();
      await expect(page.locator('#tab-roster')).toBeVisible();
      await capture(page, `manager-${width}-check-in`);

      if (width <= 640) await page.locator('#mob-nav-pools').click();
      else await page.getByRole('button', { name: 'Player IDs' }).click();
      if (width > 640) await capture(page, `manager-${width}-player-ids`);

      await openManagerCompetition(page, width);
      await capture(page, `manager-${width}-competition-pool`);

      await page.getByRole('tab', { name: 'Standings' }).click();
      await capture(page, `manager-${width}-competition-standings`);

      await page.getByRole('tab', { name: 'Bracket' }).click();
      await capture(page, `manager-${width}-competition-bracket`);
    });

    test(`manager key modals at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: viewportHeight(width) });
      await page.goto('/index.html');
      await page.getByRole('button', { name: 'Setup new tournament' }).click();
      await expect(page.locator('#setup-wizard')).toBeVisible();
      await capture(page, `manager-${width}-setup-wizard-modal`);

      await openManager(page, width);
      await openManagerCompetition(page, width);
      const first = page.locator('#pool-container .match-card').first();
      await first.locator('input[id^="s1-"]').fill('10');
      await first.locator('input[id^="s2-"]').fill('8');
      await first.getByRole('button', { name: 'Confirm Score' }).click();
      await expect(page.locator('#modal-title')).toHaveText('Invalid Score');
      await capture(page, `manager-${width}-invalid-score-modal`);
    });

    test(`player critical views at ${width}px`, async ({ page }) => {
      await openPlayer(page, width);
      await capture(page, `player-${width}-join-role-choice`);

      await page.getByRole('button', { name: /Player/ }).click();
      await expect(page.getByRole('heading', { name: 'Submit a match score' })).toBeVisible();
      await capture(page, `player-${width}-overview`);

      await page.getByRole('button', { name: 'Standings', exact: true }).click();
      await capture(page, `player-${width}-standings`);

      await page.getByRole('button', { name: 'Bracket', exact: true }).click();
      await capture(page, `player-${width}-bracket`);

      await page.getByRole('button', { name: 'Overview', exact: true }).click();
      await page.getByLabel('4-digit player PIN').fill(playerAPin);
      await page.getByRole('button', { name: 'Unlock scores' }).click();
      await expect(page.getByRole('heading', { name: 'Alexandra Verylonglastname & Benjamin Example' })).toBeVisible();
      await capture(page, `player-${width}-submit-score`);

      const firstCard = page.locator('.player-match-card').first();
      await firstCard.getByLabel('Your score').fill('11');
      await firstCard.getByLabel('Opponent').fill('7');
      await firstCard.getByRole('button', { name: 'Submit final score' }).click();
      await expect(page.locator('#score-confirm-overlay')).toHaveClass(/active/);
      const color = await page.locator('#score-confirm-value').evaluate(element => getComputedStyle(element).color);
      expect(color).toBe('rgb(248, 250, 252)');
      await capture(page, `player-${width}-score-confirmation-modal`);
    });
  }
});