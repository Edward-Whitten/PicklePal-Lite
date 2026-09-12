import { expect, test } from '@playwright/test';
import { seedTournament } from './fixtures';

async function openManager(page: import('@playwright/test').Page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof addManagerPin === 'function');
}

declare function addManagerPin(): Promise<void>;

test.describe('Multiple manager PINs', () => {
  test('a single PIN shows no revoke option', async ({ page }) => {
    await seedTournament(page, { manager: true, managerPinCount: 1 });
    await openManager(page);

    const rows = page.locator('#manager-pin-list > div');
    await expect(rows).toHaveCount(1);
    await expect(rows.first().getByRole('button', { name: 'Revoke' })).toHaveCount(0);
  });

  test('adding a manager PIN shows a second row with a revoke option', async ({ page }) => {
    await seedTournament(page, { manager: true, managerPinCount: 1 });
    await openManager(page);

    await page.evaluate(() => {
      (window as any).appPrompt = async () => '5678';
      (window as any).appAlert = async () => true;
    });
    await page.evaluate(() => addManagerPin());

    const rows = page.locator('#manager-pin-list > div');
    await expect(rows).toHaveCount(2);
    await expect(rows.first().getByRole('button', { name: 'Revoke' })).toBeVisible();
  });

  test('an invalid PIN is rejected before any network call', async ({ page }) => {
    await seedTournament(page, { manager: true, managerPinCount: 1 });
    await openManager(page);

    const alertTitle = await page.evaluate(async () => {
      (window as any).appPrompt = async () => 'abcd';
      let title = '';
      (window as any).appAlert = async (msg: string, t: string) => { title = t; return true; };
      await addManagerPin();
      return title;
    });

    expect(alertTitle).toBe('Invalid PIN');
    await expect(page.locator('#manager-pin-list > div')).toHaveCount(1);
  });

  test('revoking a PIN removes it and refuses to remove the last one', async ({ page }) => {
    await seedTournament(page, { manager: true, managerPinCount: 2 });
    await openManager(page);

    await page.evaluate(() => { (window as any).appConfirm = async () => true; });
    await page.locator('#manager-pin-list > div').first().getByRole('button', { name: 'Revoke' }).click();

    const rows = page.locator('#manager-pin-list > div');
    await expect(rows).toHaveCount(1);
    await expect(rows.first().getByRole('button', { name: 'Revoke' })).toHaveCount(0);
  });
});
