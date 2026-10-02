import { test, expect } from '@playwright/test';

test('constellation moves independently and respects reduced motion', async ({ page }, testInfo) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/config' ? { general: { title: 'Nautilus' }, appearance: {}, server: {}, client: { apiPollingInterval: 60000 }, tree: { nodes: [{ id: 'service', title: 'Server', subtitle: '', monitored: true }] } } : path === '/api/status' ? { statuses: { service: { status: 'offline', lastChecked: new Date().toISOString() } } } : {} });
  });
  await page.goto('/');
  const star = page.locator('.constellation-star').first();
  await expect(star).toBeVisible();
  const start = Number(await star.getAttribute('cx'));
  await expect.poll(async () => Math.abs(Number(await star.getAttribute('cx')) - start)).toBeGreaterThan(3);
  await expect(page.locator('.orb-current')).toHaveCount(0);
  await expect(page.locator('.constellation-particle')).toHaveCount(0);
  await expect(page.locator('.orb-content')).toHaveCSS('background-image', 'none');
  await page.screenshot({ path: testInfo.outputPath('moving-constellation.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const still = await star.getAttribute('cx');
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
  expect(await star.getAttribute('cx')).toBe(still);
});
