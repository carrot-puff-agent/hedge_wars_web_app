import { expect, test } from '@playwright/test';

test('Ukrainian hub, playful interaction, game deep link and live hello', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  await expect(page.getByRole('heading', { name: 'Збирай своїх. Буде весело!' })).toBeVisible();
  await page.getByRole('button', { name: 'Підкинути настрій' }).click();
  await expect(page.getByRole('status')).toHaveText('Настрій підстрибнув! Їжачок схвалює.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Зазирнути в майстерню' }).click();
  await expect(page).toHaveURL(/\/games\/hedge-wars\/$/);
  await expect(page.getByRole('heading', { name: 'Їжачі баталії' })).toBeVisible();
  await expect(page.locator('#connection')).toContainText('Майстерня відчинена');
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Підбадьорити їжачка' }).click();
  await expect(page.locator('#wave-status')).toContainText('колючі обійми');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.reload();
  await expect(page.locator('#connection')).toContainText('Майстерня відчинена');
  await page.getByRole('link', { name: 'До клубу' }).click();
  await expect(page).toHaveURL('/');
  expect(errors).toEqual([]);
});

test('reduced motion and keyboard navigation remain usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Їжаклуб — головна' })).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  const response = await page.request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  expect((await response.json()).lang).toBe('uk');
});
