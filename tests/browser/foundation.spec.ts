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

test('Chrome sends the session cookie when fetching the protected manifest on both pages', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'pwa_test_session', value: 'test-only', url: baseURL! }]);
  let receivedCookie: boolean | undefined;
  await page.route('**/manifest.webmanifest', async (route) => {
    const headers = await route.request().allHeaders();
    receivedCookie = headers.cookie?.includes('pwa_test_session=test-only') ?? false;
    if (!receivedCookie) return route.fulfill({ status: 401, body: 'Authentication required' });
    return route.continue();
  });
  for (const path of ['/', '/games/hedge-wars/']) {
    receivedCookie = undefined;
    await page.goto(path);
    const client = await context.newCDPSession(page);
    try {
      await client.send('Page.getAppManifest');
      await expect.poll(() => receivedCookie).toBe(true);
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('crossorigin', 'use-credentials');
    } finally {
      await client.detach();
    }
  }
});

test('PWA installs its shell cache and serves visited routes offline', async ({ page, context }) => {
  test.skip(process.env.E2E_MODE === 'development', 'Service worker is generated for production builds.');
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const cdp = await context.newCDPSession(page);
  const installability = await cdp.send('Page.getInstallabilityErrors');
  // Playwright's isolated contexts are incognito and Chrome cannot install into them.
  expect(installability.installabilityErrors.filter((error) => error.errorId !== 'in-incognito')).toEqual([]);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Збирай своїх. Буде весело!' })).toBeVisible();
    await page.goto('/games/hedge-wars/');
    await expect(page.getByRole('heading', { name: 'Їжачі баталії' })).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
  } finally {
    await context.setOffline(false);
    await cdp.detach();
  }
});
