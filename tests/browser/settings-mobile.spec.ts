import { test, expect } from '@playwright/test';

const TOKEN_KEY = 'nautilus_auth_token';
const service = (id: string, title: string, children: unknown[] = []) => ({ id, title, subtitle: '', icon: 'server', ip: '10.0.0.1', children });
const nodes = [service('pelican', 'Pelican', [service('nanokvm', 'NanoKVM', [service('beluga', 'Beluga', [service('amp', 'AMP', [service('last', 'Last To Leave'), service('portfolio', 'Portfolio Koen with a long name')]), service('starfish', 'Starfish')])])])];

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('settings fit a phone screen on every tab', async ({ page }, testInfo) => {
  const config = { general: { title: 'Nautilus' }, appearance: { accentColor: '#65d7e8' }, server: { healthCheckInterval: 20000, corsOrigins: [] }, client: { apiPollingInterval: 60000 }, tree: { nodes } };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === '/api/config' ? config : path === '/api/auth/status' ? { authDisabled: false } : path === '/api/status' ? { statuses: {}, timestamp: new Date().toISOString() } : path === '/api/version' ? { tag: 'v2.0.0', sha: 'abc1234' } : path === '/api/auth/account' ? { username: 'admin', source: 'file' } : {};
    return route.fulfill({ json: data });
  });
  await page.addInitScript(key => sessionStorage.setItem(key, 'test-token'), TOKEN_KEY);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(390);
  // Footer actions stay on one row without wrapping their labels.
  const actions = await dialog.locator('.settings-actions button').evaluateAll(buttons => buttons.map(b => b.getBoundingClientRect()).map(r => ({ top: Math.round(r.top), height: Math.round(r.height) })));
  expect(new Set(actions.map(a => a.top)).size).toBe(1);
  actions.forEach(a => expect(a.height).toBeLessThan(48));
  for (const tab of ['General', 'Notifications', 'Account']) {
    await dialog.getByRole('button', { name: tab, exact: true }).click();
    // Nothing inside the dialog may be wider than the phone.
    const overflow = await dialog.evaluate(root => [...root.querySelectorAll<HTMLElement>('*')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + .5 || r.left < -.5) && !el.closest('.settings-navigation'); }).map(el => `${el.tagName}.${el.className}`.slice(0, 80)));
    expect(overflow, `${tab} overflows`).toEqual([]);
    const content = dialog.locator('.settings-content');
    expect(await content.evaluate(el => el.scrollWidth - el.clientWidth), `${tab} scrolls sideways`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath(`settings-${tab.toLowerCase()}.png`), fullPage: false });
  }
});
