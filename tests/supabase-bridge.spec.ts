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

  test('retries transient bridge failures before returning public state', async ({ page }) => {
    let calls = 0;
    await page.route('**/functions/v1/tournament-api', async route => {
      calls += 1;
      if (calls < 3) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Edge unavailable' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: { teams: [] } }) });
    });
    await page.goto('/players.html');
    const result = await page.evaluate(() => window.supabaseBridge.call('public', { tournament: 'retrycheck' }));
    expect(result).toEqual({ state: { teams: [] } });
    expect(calls).toBe(3);
  });

  test('deduplicates simultaneous identical bridge requests', async ({ page }) => {
    let calls = 0;
    await page.route('**/functions/v1/tournament-api', async route => {
      calls += 1;
      await new Promise(resolve => setTimeout(resolve, 150));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: { teams: [] } }) });
    });
    await page.goto('/players.html');
    const results = await page.evaluate(() => Promise.all([
      window.supabaseBridge.call('public', { tournament: 'dedupecheck' }),
      window.supabaseBridge.call('public', { tournament: 'dedupecheck' }),
    ]));
    expect(results).toEqual([{ state: { teams: [] } }, { state: { teams: [] } }]);
    expect(calls).toBe(1);
  });

  test('maps player identify and check-in callables to scoped actions', async ({ page }) => {
    const actions: string[] = [];
    await page.route('**/functions/v1/tournament-api', async route => {
      const body = await route.request().postDataJSON();
      actions.push(body.action);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionToken: 'player-token', status: 'checked-in', playerId: '1:p1', playerSlot: 'p1', teamId: '1', scorePin: '1111' }) });
    });
    await page.goto('/players.html');
    const identity = await page.evaluate(() => window.functions.httpsCallable('playerIdentify')({ tournament: 'checkin', playerName: 'Alexandra Example' }));
    const result = await page.evaluate(() => window.functions.httpsCallable('checkInPlayer')({ tournament: 'checkin' }));
    expect(actions).toEqual(['player-identify', 'player-checkin']);
    expect(identity.data).toMatchObject({ token: 'player-token', playerId: '1:p1', playerSlot: 'p1', teamId: '1' });
    expect(result.data).toMatchObject({ playerId: '1:p1', playerSlot: 'p1', teamId: '1', scorePin: '1111', status: 'checked-in' });
  });

  test('maps Round Robin remove to delete-event action', async ({ page }) => {
    let body: { action?: string; kind?: string; tournament?: string } = {};
    await page.route('**/functions/v1/tournament-api', async route => {
      body = await route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'deleted' }) });
    });
    await page.goto('/index.html?mode=round-robin');
    await page.waitForFunction(() => Boolean(window.roundRobinApi?.remove));
    const result = await page.evaluate(() => window.roundRobinApi.remove({ tournament: 'smash' }));
    expect(body).toMatchObject({ action: 'delete-event', kind: 'round_robin', tournament: 'smash' });
    expect(result).toEqual({ status: 'deleted' });
  });
});