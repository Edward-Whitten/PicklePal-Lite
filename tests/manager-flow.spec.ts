import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, seedTournament, tournamentCode } from './fixtures';

async function openManagerTab(page: import('@playwright/test').Page, tab: 'roster' | 'pools') {
  const mobile = (await page.viewportSize())!.width <= 640;
  await (mobile ? page.locator(tab === 'roster' ? '#mob-nav-roster' : '#mob-nav-pools') : page.getByRole('button', { name: tab === 'roster' ? 'Check-In' : 'Competition' })).click();
}

test.describe('Home and manager workspace', () => {
  test('Home access is scrollable, code-first, and opens manager PIN toast', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.getByRole('heading', { name: 'One-Word Tournament Code' })).toBeVisible();
    await expect(page.getByLabel('Four-digit manager PIN')).toBeHidden();
    const roleLabelsFit = await page.locator('.lobby-actions .btn').evaluateAll(buttons => buttons.every(button => {
      const label = button.querySelector('.lobby-role-label');
      return Boolean(label && label.scrollWidth <= label.clientWidth && label.getBoundingClientRect().width <= button.getBoundingClientRect().width);
    }));
    expect(roleLabelsFit).toBe(true);
    const homeOrder = await page.evaluate(() => {
      const setup = document.querySelector('.lobby-create-action')?.getBoundingClientRect();
      const login = document.querySelector('.lobby-panel h2')?.getBoundingClientRect();
      const roles = document.querySelector('.lobby-actions')?.getBoundingClientRect();
      return Boolean(setup && login && roles && setup.top < login.top && login.top < roles.top);
    });
    expect(homeOrder).toBe(true);
    await page.getByRole('button', { name: 'Setup new tournament' }).click();
    await expect(page.locator('#wizard-step-1')).toBeVisible();
    await expect(page.locator('label[for="wizard-manager-input"]')).toHaveText('Manager(s)');
    await expect(page.locator('#wizard-manager-input')).toBeVisible();
    await expect(page.getByLabel('Second manager')).toBeVisible();
    await page.getByRole('button', { name: 'Close setup wizard' }).click();
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
    const registrationLayout = await page.locator('.registration-panel').evaluate(panel => {
      const panelRect = panel.getBoundingClientRect();
      const controls = [...panel.querySelectorAll('#new-p1, #new-p2, .add-team-fields .btn')].map(element => element.getBoundingClientRect());
      const meterStyle = getComputedStyle(panel.querySelector('.registration-meter')!);
      return {
        controlsFit: controls.every(rect => rect.left >= panelRect.left && rect.right <= panelRect.right),
        noDivider: meterStyle.borderLeftStyle === 'none' || meterStyle.borderLeftWidth === '0px',
      };
    });
    expect(registrationLayout).toEqual({ controlsFit: true, noDivider: true });
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

  test('manager player ID directory keeps score PINs after refresh', async ({ page }) => {
    await seedTournament(page, { manager: true });
    await page.addInitScript(({ code }) => {
      const key = `picklepal_tournament_${code}`;
      const state = JSON.parse(localStorage.getItem(key)!);
      state.teams = state.teams.map((team: any) => ({ ...team, pin: undefined }));
      localStorage.setItem(key, JSON.stringify(state));
    }, { code: tournamentCode });
    await page.goto('/index.html');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Player IDs' }).click();
    await expect(page.locator('#player-pin-directory-list')).toContainText('1111');
    await expect(page.locator('#player-pin-directory-list')).not.toContainText('N/A');
  });

  test('generates a four-team pool and preserves score validation', async ({ page }) => {
    await seedTournament(page, { manager: true });
    await page.goto('/index.html');
    await openManagerTab(page, 'pools');
    await expect(page.getByRole('tab', { name: 'Pool Play' })).toHaveClass(/active/);
    await expect(page.getByRole('tab', { name: 'Standings' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Bracket' })).toBeVisible();
    await expect(page.locator('#pool-container .match-card')).toHaveCount(6);
    const first = page.locator('#pool-container .match-card').first();
    await first.locator('input[id^="s1-"]').fill('10');
    await first.locator('input[id^="s2-"]').fill('8');
    await first.getByRole('button', { name: 'Confirm Score' }).click();
    await expect(page.locator('#modal-title')).toHaveText('Invalid Score');
    await page.keyboard.press('Escape');
    await expect(page.locator('#app-modal')).not.toHaveClass(/active/);
  });

  test('competition workspace switches between pool, standings, and bracket panes', async ({ page }) => {
    await seedTournament(page, { manager: true });
    await page.goto('/index.html');
    await openManagerTab(page, 'pools');
    await expect(page.locator('#tab-competition')).toBeVisible();
    await expect(page.locator('#competition-pane-pools')).toHaveClass(/active/);
    await page.getByRole('tab', { name: 'Standings' }).click();
    await expect(page.locator('#competition-pane-standings')).toHaveClass(/active/);
    await expect(page.locator('#overall-standings-list')).toContainText('bracket spots');
    await page.getByRole('tab', { name: 'Bracket' }).click();
    await expect(page.locator('#competition-pane-bracket')).toHaveClass(/active/);
    await expect(page.getByRole('button', { name: 'Seed Bracket' })).toBeVisible();
  });

  test('manager Pool Play uses pool tabs instead of one endless match list', async ({ page }) => {
    await seedTournament(page, { manager: true });
    await page.addInitScript(({ code }) => {
      const key = `picklepal_tournament_${code}`;
      const state = JSON.parse(localStorage.getItem(key)!);
      state.poolCount = 2;
      state.teams = state.teams.map((team: any, index: number) => ({ ...team, pool: index < 2 ? 0 : 1 }));
      localStorage.setItem(key, JSON.stringify(state));
    }, { code: tournamentCode });
    await page.goto('/index.html');
    await openManagerTab(page, 'pools');
    await expect(page.locator('#manager-pool-tabs .manager-pool-tab')).toHaveCount(2);
    await expect(page.locator('#manager-pool-tabs .manager-pool-tab').first()).toHaveClass(/active/);
    await expect(page.locator('#pool-container .match-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Pool B' }).click();
    await expect(page.locator('#manager-pool-tabs .manager-pool-tab').nth(1)).toHaveClass(/active/);
    await expect(page.locator('#pool-container')).toContainText('Emerson T.');
    await expect(page.locator('#pool-container')).not.toContainText('Alexandra V.');
  });

  test('manager pool score fields stay compact so team names have room', async ({ page }) => {
    await seedTournament(page, { manager: true });
    await page.goto('/index.html');
    await openManagerTab(page, 'pools');
    const layout = await page.locator('#pool-container .match-card').first().evaluate(card => {
      const row = card.querySelector('.team-row')!;
      const name = row.querySelector('span')!.getBoundingClientRect();
      const input = row.querySelector('.score-input')!.getBoundingClientRect();
      return { nameWidth: Math.round(name.width), inputWidth: Math.round(input.width) };
    });
    expect(layout.inputWidth).toBeLessThanOrEqual(56);
    expect(layout.nameWidth).toBeGreaterThan(layout.inputWidth * 3);
  });

  test('manager can reform stranded players before start and reform locks after start', async ({ page }) => {
    await seedTournament(page, { manager: true });
    await page.addInitScript(({ code }) => {
      const key = `picklepal_tournament_${code}`;
      const state = JSON.parse(localStorage.getItem(key)!);
      state.expectedTeams = 6;
      state.stranded = ['Loose One', 'Loose Two'];
      state.tournamentStarted = false;
      localStorage.setItem(key, JSON.stringify(state));
    }, { code: tournamentCode });
    await page.goto('/index.html');
    await openManagerTab(page, 'roster');
    await page.locator('.s-check').nth(0).check();
    await page.locator('.s-check').nth(1).check();
    await page.getByRole('button', { name: 'Form New Team' }).click();
    await expect(page.locator('#roster-list .team-row-entry')).toHaveCount(5);
    await page.evaluate(() => {
      state.tournamentStarted = true;
      state.stranded = ['Late One', 'Late Two'];
      renderRoster();
    });
    await page.locator('.s-check').nth(0).check();
    await page.locator('.s-check').nth(1).check();
    await page.getByRole('button', { name: 'Form New Team' }).click();
    await expect(page.locator('#modal-title')).toHaveText('Tournament Started');
  });
});