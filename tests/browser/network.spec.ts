import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import type { AppConfig, TreeNode, NodeStatus } from '../../src/types/config';

const service = (id: string, title: string, icon = 'server'): TreeNode => ({ id, title, subtitle: `${title} service`, icon, monitored: true, internalAddress: `${id}.test:8080`, externalAddress: `https://${id}.test`, healthCheckType: 'http' });
function fixture(): AppConfig {
  const root = { ...service('home', 'Home lab', 'network'), children: [
    { ...service('platform', 'Platform', 'cpu'), children: ['Proxmox', 'Docker', 'Portainer', 'Uptime Kuma'].map((name, i) => service(`platform-${i}`, name)) },
    { ...service('media', 'Media', 'play'), children: [{ ...service('plex', 'Plex', 'film'), healthCheckType: 'plex' as const }, service('sonarr', 'Sonarr', 'tv'), service('radarr', 'Radarr', 'clapperboard'), service('overseerr', 'Overseerr', 'popcorn')] },
    { ...service('smart-home', 'Smart home', 'house'), children: [service('assistant', 'Home Assistant', 'house'), service('mqtt', 'MQTT', 'radio'), service('zigbee', 'Zigbee', 'lightbulb'), service('nodered', 'Node-RED', 'workflow')] },
    { ...service('storage', 'Storage', 'hard-drive'), children: [service('nas', 'TrueNAS', 'hard-drive'), service('backup', 'Backup', 'archive'), service('photos', 'Immich', 'image'), service('files', 'Nextcloud', 'cloud')] },
    { ...service('network', 'Network services', 'router'), children: [service('dns', 'AdGuard', 'shield'), service('proxy', 'Reverse proxy', 'route'), service('vpn', 'WireGuard', 'lock'), { ...service('minecraft', 'Minecraft', 'gamepad-2'), healthCheckType: 'minecraft' as const }] },
  ] };
  return { general: { title: 'Nautilus' }, appearance: { accentColor: '#ff0000' }, server: { healthCheckInterval: 20000, corsOrigins: [] }, client: { apiPollingInterval: 60000 }, tree: { nodes: [root] } };
}
/** Resolves on the next scheduled status poll; the dashboard has no manual refresh control. */
const nextPoll = (page: Page) => page.waitForResponse(response => new URL(response.url()).pathname === '/api/status');
const flatten = (nodes: TreeNode[]): TreeNode[] => nodes.flatMap(n => [n, ...flatten(n.children ?? [])]);
async function mockNetwork(page: Page, initial = fixture()) {
  let config = structuredClone(initial);
  let unavailable = false;
  let failSave = false;
  let writes = 0;
  const now = new Date().toISOString();
  const statuses: Record<string, NodeStatus> = {};
  flatten(config.tree.nodes).forEach((node, i) => {
    statuses[node.id] = { status: node.id === 'mqtt' ? 'offline' : node.id === 'backup' ? 'backup' : i === 8 ? 'checking' : 'online', lastChecked: now, statusChangedAt: new Date(Date.now() - 3600000).toISOString(), responseTime: 12 + i, streams: node.healthCheckType === 'plex' ? 3 : undefined, players: node.healthCheckType === 'minecraft' ? { online: 2, max: 20 } : undefined };
  });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    let data: unknown = {};
    if (url.pathname === '/api/config') {
      if (route.request().method() === 'POST') {
        writes++;
        if (failSave) return route.fulfill({ status: 500, json: { error: 'Simulated save failure' } });
        config = route.request().postDataJSON();
      }
      data = config;
    } else if (url.pathname === '/api/auth/status') data = { authDisabled: true };
    else if (url.pathname === '/api/status') {
      if (unavailable) return route.fulfill({ status: 503, json: { error: 'Monitoring unavailable' } });
      data = { timestamp: now, statuses };
    } else if (url.pathname.startsWith('/api/history')) data = url.pathname === '/api/history' ? { nodes: {}, summary: { uptimePercent: null, outageCount: 0, avgResponseTime: null }, period: '7d', sinceMs: Date.now() - 86400000, nowMs: Date.now() } : { records: [], nodeId: url.pathname.split('/').at(-1), period: '7d', sinceMs: Date.now() - 86400000, nowMs: Date.now() };
    else if (url.pathname.includes('network-scan')) data = { active: false, hasRecentResults: false, status: 'idle' };
    else if (url.pathname === '/api/version') data = { tag: 'Design preview', sha: 'local' };
    return route.fulfill({ json: data });
  });
  return { getConfig: () => config, getWrites: () => writes, failSave: () => { failSave = true; }, allowSave: () => { failSave = false; }, disconnect: () => { unavailable = true; } };
}

test('radial map, inspector, filtering and collapse preserve topology and totals', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await mockNetwork(page);
  await page.goto('/');
  await expect(page.locator('.node-body')).toHaveCount(27);
  await expect(page.getByText('Live network', { exact: true })).toBeVisible();
  if (await page.locator('.radial-world').count()) await expect(page.locator('.radial-world')).toHaveAttribute('data-layout-settled', 'true');
  const rootBody = await page.locator('.root-node .node-body').boundingBox();
  expect(rootBody!.width).toBeGreaterThan(104);
  await expect(page.locator('.root-node .health-ring')).toHaveCount(0);
  await expect(page.locator('.root-node .orb-indicators')).toContainText('Offline');
  await expect(page.locator('.network-header .network-health')).toHaveCount(0);
  await page.screenshot({ animations: 'disabled', path: 'test-results/desktop-map.png' });
  const positions = await page.locator('.radial-node').evaluateAll(nodes => nodes.map(n => (n as HTMLElement).style.transform));
  await page.getByRole('group', { name: 'Network health', exact: true }).getByRole('button', { name: '1 offline', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Search results' })).toContainText('MQTT');
  expect(await page.locator('.radial-node').evaluateAll(nodes => nodes.map(n => (n as HTMLElement).style.transform))).toEqual(positions);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.locator('[data-select-node="smart-home"]').hover();
  await page.getByRole('button', { name: 'Collapse Smart home;', exact: false }).click();
  await expect(page.locator('.node-body')).toHaveCount(23);
  await expect(page.getByRole('button', { name: /^Expand Smart home;/ })).toHaveAttribute('title', /1 offline/);
  await expect(page.getByRole('button', { name: /^Expand Smart home;/ }).locator('.health-ring')).toBeVisible();
  await page.getByRole('textbox', { name: 'Search network' }).fill('MQTT');
  await page.getByRole('complementary', { name: 'Search results' }).getByRole('button', { name: /MQTT/ }).click();
  await expect(page.getByRole('complementary', { name: 'MQTT details' })).toBeVisible();
  await expect(page.locator('[data-select-node="mqtt"]')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  if (await page.locator('.radial-world').count()) await expect(page.locator('.radial-world')).toHaveAttribute('data-layout-settled', 'true');
  await page.screenshot({ animations: 'disabled', path: 'test-results/desktop-inspector.png' });
  await expect(page.getByRole('button', { name: 'Focus branch', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Collapse children', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('service launch, history, settings and editing use the new surfaces', async ({ page }) => {
  const api = await mockNetwork(page);
  await page.goto('/');
  await page.locator('[data-select-node="home"]').click();
  await page.context().route('https://home.test/**', route => route.fulfill({ body: 'home' }));
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open Home lab', exact: true }).click();
  await expect.poll(async () => (await popup).url()).toContain('home.test');
  await (await popup).close();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  if (await page.locator('.radial-world').count()) await expect(page.locator('.radial-world')).toHaveAttribute('data-layout-settled', 'true');
  await page.screenshot({ animations: 'disabled', path: 'test-results/settings.png' });
  await expect(page.getByRole('button', { name: 'Appearance', exact: true })).toHaveCount(0); // the look is fixed
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'Edit network', exact: true }).click();
  await page.locator('[data-select-node="home"]').click(); // edit mode opens the editor directly
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Home lab');
  await page.getByLabel('Title', { exact: true }).fill('Observatory');
  await page.screenshot({ animations: 'disabled', path: 'test-results/node-editor.png' });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => api.getConfig().tree.nodes[0].title).toBe('Observatory');
});

test('mobile list and map share inspection and support narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const config = fixture();
  flatten(config.tree.nodes).forEach(node => { node.healthCheckType = 'http'; });
  await mockNetwork(page, config);
  await page.goto('/');
  await expect(page.locator('.root-node .node-body')).toBeVisible(); // the map is the default on mobile too
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.locator('.network-list')).toBeVisible();
  expect((await page.locator('.network-header').boundingBox())!.height).toBeLessThanOrEqual(65);
  await page.getByRole('button', { name: 'Network health', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Health filters' })).toBeVisible();
  await page.keyboard.press('Escape');
  if (await page.locator('.radial-world').count()) await expect(page.locator('.radial-world')).toHaveAttribute('data-layout-settled', 'true');
  await page.screenshot({ animations: 'disabled', path: 'test-results/mobile-list.png' });
  await page.locator('[data-select-node="home"]').click();
  await expect(page.getByRole('complementary', { name: 'Home lab details' })).toBeVisible();
  if (await page.locator('.radial-world').count()) await expect(page.locator('.radial-world')).toHaveAttribute('data-layout-settled', 'true');
  await page.screenshot({ animations: 'disabled', path: 'test-results/mobile-inspector.png' });
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(page.locator('.node-body')).toHaveCount(27);
  if (await page.locator('.radial-world').count()) await expect(page.locator('.radial-world')).toHaveAttribute('data-layout-settled', 'true');
  await page.screenshot({ animations: 'disabled', path: 'test-results/mobile-map.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('large sample opens folded; show all and stale status remain usable', async ({ page }) => {
  const large = JSON.parse(readFileSync('config.dummy.json', 'utf8')) as AppConfig;
  large.appearance = { accentColor: '#65d7e8' };
  large.general = { title: 'Nautilus' };
  flatten(large.tree.nodes).forEach(n => { n.monitored = true; n.collapsed = false; });
  large.server = { ...large.server, healthCheckInterval: 1000 };
  const api = await mockNetwork(page, large);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Show all', exact: true })).toBeVisible();
  expect(await page.locator('.node-body').count()).toBeLessThan(127);
  if (await page.locator('.radial-world').count()) await expect(page.locator('.radial-world')).toHaveAttribute('data-layout-settled', 'true');
  await page.screenshot({ animations: 'disabled', path: 'test-results/large-overview.png' });
  expect(api.getWrites()).toBe(0);
  await page.getByRole('button', { name: 'Show all', exact: true }).click();
  await expect(page.locator('.node-body')).toHaveCount(127);
  await page.getByRole('button', { name: 'Fit network', exact: true }).click();
  if (await page.locator('.radial-world').count()) await expect(page.locator('.radial-world')).toHaveAttribute('data-layout-settled', 'true');
  await page.screenshot({ animations: 'disabled', path: 'test-results/large-expanded.png' });
  const before = await page.locator('.radial-node').evaluateAll(nodes => nodes.map(n => (n as HTMLElement).style.transform));
  await nextPoll(page);
  expect(await page.locator('.radial-node').evaluateAll(nodes => nodes.map(n => (n as HTMLElement).style.transform))).toEqual(before);
  const [frames] = await Promise.all([
    page.evaluate(() => new Promise<number[]>(resolve => {
      const samples: number[] = [];
      let previous = performance.now();
      function measure(now: number) {
        samples.push(now - previous); previous = now;
        if (samples.length >= 30) resolve(samples.slice(1)); else requestAnimationFrame(measure);
      }
      requestAnimationFrame(measure);
    })),
    (async () => { await page.mouse.move(1050, 650); await page.mouse.down(); await page.mouse.move(1200, 710, { steps: 30 }); await page.mouse.up(); })(),
  ]);
  console.log(`126-node pan: mean ${(frames.reduce((a, b) => a + b, 0) / frames.length).toFixed(1)} ms/frame`);
  api.disconnect();
  await nextPoll(page);
  await expect(page.getByRole('status')).toContainText('Showing last known readings');
});

test('keyboard selection and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockNetwork(page);
  await page.goto('/');
  await page.locator('[data-select-node="home"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Home lab details' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-select-node="home"]')).toBeFocused();
});

test('failed collapse saves retain the local view and rapid toggles finish consistently', async ({ page }) => {
  const api = await mockNetwork(page);
  await page.goto('/');
  await expect(page.locator('.radial-world')).toHaveAttribute('data-layout-settled', 'true');
  api.failSave();
  await page.locator('[data-select-node="smart-home"]').hover();
  await page.getByRole('button', { name: 'Collapse Smart home;', exact: false }).click();
  await expect(page.getByText('Collapse preference could not be saved.', { exact: false })).toBeVisible();
  await expect(page.locator('.node-body')).toHaveCount(23);
  await page.getByRole('button', { name: 'Expand Smart home;', exact: false }).click();
  await expect(page.locator('.node-body')).toHaveCount(27);
  expect(flatten(api.getConfig().tree.nodes).find(n => n.id === 'smart-home')?.collapsed).not.toBe(true);
});

test('reparenting rejects descendants, persists moves, and reports failures', async ({ page }) => {
  // The parent picker only exists on phones; desktop moves nodes on the canvas.
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await mockNetwork(page);
  await page.goto('/');
  await page.locator('[data-select-node="smart-home"]').click();
  await page.getByRole('button', { name: 'Edit node', exact: true }).click();
  await page.getByText('Position in network', { exact: true }).click();
  await expect(page.getByLabel('Parent', { exact: true }).locator('option[value="mqtt"]')).toHaveCount(0);
  await page.getByLabel('Parent', { exact: true }).selectOption('storage');
  await page.getByRole('button', { name: 'Move node', exact: true }).click();
  await expect.poll(() => flatten(api.getConfig().tree.nodes).find(n => n.id === 'storage')?.children?.some(n => n.id === 'smart-home')).toBe(true);
  api.failSave();
  await page.getByLabel('Parent', { exact: true }).selectOption('home');
  await page.getByRole('button', { name: 'Move node', exact: true }).click();
  await expect(page.locator('.inspector-error')).toBeVisible();
  expect(flatten(api.getConfig().tree.nodes).find(n => n.id === 'storage')?.children?.some(n => n.id === 'smart-home')).toBe(true);
});

test('empty network shows the full-screen welcome splash', async ({ page }) => {
  const config = fixture(); config.tree.nodes = [];
  await mockNetwork(page, config);
  await page.goto('/');
  const splash = page.getByRole('dialog', { name: 'Welcome to Nautilus' });
  await expect(splash).toBeVisible();
  const box = await splash.boundingBox(), viewport = page.viewportSize()!;
  expect(box).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  await expect(splash.getByRole('button', { name: 'Discover nodes' })).toBeVisible();
  await expect(splash.getByRole('button', { name: 'Create node manually' })).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: 'test-results/welcome-splash.png' });
});

test('discovery and authentication match the dark workspace', async ({ page }) => {
  await mockNetwork(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Discover nodes', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Network discovery' })).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: 'test-results/discovery.png' });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.route('**/api/auth/status', route => route.fulfill({ json: { authDisabled: false } }));
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: 'test-results/authentication.png' });
});


test('local topology and tablet visual review', async ({ page }) => {
  test.skip(!existsSync('config.json'), 'Optional local configuration preview');
  const config = JSON.parse(readFileSync('config.json', 'utf8')) as AppConfig;
  config.appearance = { accentColor: '#65d7e8' };
  config.general = { title: 'Nautilus' };
  flatten(config.tree.nodes).forEach(n => { n.monitored = true; });
  await mockNetwork(page, config);
  await page.goto('/');
  await expect(page.locator('.radial-world')).toHaveAttribute('data-layout-settled', 'true');
  if (await page.locator('.radial-world').count()) await expect(page.locator('.radial-world')).toHaveAttribute('data-layout-settled', 'true');
  await page.screenshot({ animations: 'disabled', path: 'test-results/local-topology.png' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: 'Fit network', exact: true }).click();
  if (await page.locator('.radial-world').count()) await expect(page.locator('.radial-world')).toHaveAttribute('data-layout-settled', 'true');
  await page.screenshot({ animations: 'disabled', path: 'test-results/wide-map.png' });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole('button', { name: 'Fit network', exact: true }).click();
  if (await page.locator('.radial-world').count()) await expect(page.locator('.radial-world')).toHaveAttribute('data-layout-settled', 'true');
  await page.screenshot({ animations: 'disabled', path: 'test-results/tablet-map.png' });
});


test('canvas drag avoids text selection and preserves inspector text selection', async ({ page }) => {
  await mockNetwork(page);
  await page.goto('/');
  await expect(page.locator('.radial-world')).toHaveAttribute('data-layout-settled', 'true');
  const before = await page.locator('.radial-world').getAttribute('style');
  const label = await page.locator('.radial-node:has([data-select-node="home"]) .node-label').boundingBox();
  if (!label) throw new Error('Missing home label');
  await page.mouse.move(label.x + 10, label.y + 8);
  await page.mouse.down();
  await page.mouse.move(label.x + 180, label.y + 110, { steps: 12 });
  await page.mouse.up();
  expect(await page.locator('.radial-world').getAttribute('style')).not.toBe(before);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
  await expect(page.locator('.node-inspector')).toHaveCount(0);
  await page.locator('[data-select-node="home"]').click();
  await page.locator('.inspector-identity h2').dblclick({ position: { x: 15, y: 12 } });
  expect(await page.evaluate(() => window.getSelection()?.toString())).toContain('Home');
});

test('inventory, compact controls, settings sections and populated history', async ({ page }) => {
  const config = fixture();
  config.tree.nodes[0].children!.push({ id: 'unmonitored', title: 'Unmonitored service', icon: 'server', monitored: false });
  await mockNetwork(page, config);
  const nowMs = Date.now(), sinceMs = nowMs - 86400000;
  const records = Array.from({ length: 160 }, (_, i) => ({ timestamp: sinceMs + i * 540000, status: i > 70 && i < 78 ? 'offline' : 'online', responseTime: 15 + i % 12, error: i === 71 ? 'Connection timed out' : null, playersOnline: null, playersMax: null, streams: null }));
  const summary = { buckets: records.map(r => r.status), recordCount: records.length, stats: { uptimePercent: 95, outageCount: 1, avgResponseTime: 20 } };
  await page.route('**/api/history**', route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/history'
    ? { nodes: Object.fromEntries(flatten(config.tree.nodes).map(n => [n.id, summary])), summary: summary.stats, sinceMs, nowMs, period: '7d' }
    : { records, sinceMs, nowMs, period: '7d' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.locator('.inventory-columns')).toBeVisible();
  const columns = await page.locator('.list-health').evaluateAll(nodes => nodes.slice(0, 8).map(n => Math.round(n.getBoundingClientRect().left)));
  expect(new Set(columns).size).toBe(1);
  await page.screenshot({ animations: 'disabled', path: 'test-results/desktop-inventory.png' });
  await page.locator('[data-select-node="unmonitored"]').click();
  await expect(page.locator('.inspector-status')).toHaveText('Unmonitored');
  await page.screenshot({ animations: 'disabled', path: 'test-results/unmonitored-inspector.png' });
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await expect(page.locator('.node-inspector')).toHaveCount(0); // closing animates out first
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.locator('.ledger-row')).toHaveCount(26);
  await page.screenshot({ animations: 'disabled', path: 'test-results/history-report.png' });
  await page.locator('.ledger-row').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Connection timed out')).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: 'test-results/history-service.png' });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  for (const section of ['Notifications', 'Account']) {
    await page.getByRole('button', { name: section, exact: true }).click();
    await page.screenshot({ animations: 'disabled', path: `test-results/settings-${section.toLowerCase()}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'General', exact: true }).click();
  await page.screenshot({ animations: 'disabled', path: 'test-results/mobile-settings.png' });
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.getByRole('textbox', { name: 'Search network' })).toBeHidden();
  await page.getByRole('button', { name: 'Search network', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search network' }).fill('Plex');
  await expect(page.getByRole('complementary', { name: 'Search results' })).toContainText('Plex');
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.locator('.ledger-row')).toHaveCount(26);
  await page.screenshot({ animations: 'disabled', path: 'test-results/mobile-history.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('restore stages the backup, retries failed saves, replaces the network and resets its view', async ({ page }) => {
  const api = await mockNetwork(page);
  await page.goto('/');
  await page.getByRole('button', { name: /^Collapse Home lab;/ }).click();
  await expect(page.locator('.node-body')).toHaveCount(2);
  await page.mouse.move(600, 650);
  await page.mouse.down();
  await page.mouse.move(1300, 700, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const writesBeforeImport = api.getWrites();
  const backup = fixture();
  backup.general.title = 'Restored workspace';
  backup.tree.nodes = [{ ...service('home', 'Restored root'), children: [service('restored-a', 'Restored A'), service('restored-b', 'Restored B')] }];
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Restore Backup/ }).click();
  await (await chooserPromise).setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByRole('alertdialog')).toContainText('Load 3 nodes');
  await page.getByRole('button', { name: 'Restore backup', exact: true }).click();
  await expect(page.getByText('Backup ready to apply')).toBeVisible();
  expect(api.getWrites()).toBe(writesBeforeImport);
  api.failSave();
  await page.getByRole('button', { name: 'Save restored network' }).click();
  await expect(page.getByText('Error saving settings')).toBeVisible();
  await expect(page.getByText('Backup ready to apply')).toBeVisible();
  expect(api.getConfig().tree.nodes[0].title).toBe('Home lab');
  api.allowSave();
  const save = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/api/config?replace=true'));
  await page.getByRole('button', { name: 'Save restored network' }).click();
  expect((await save).postDataJSON().tree.nodes).toEqual(backup.tree.nodes);
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toHaveCount(0);
  await expect(page.locator('.node-body')).toHaveCount(4);
  await expect(page.locator('.network-brand')).toContainText('Restored workspace');
  await expect(page.locator('[data-select-node="home"]')).toBeInViewport();
  await page.reload();
  await expect(page.locator('.node-body')).toHaveCount(4);
  await expect(page.locator('.network-brand')).toContainText('Restored workspace');
});

test('saved restore remains visible when its follow-up config read fails', async ({ page }) => {
  await mockNetwork(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const backup = fixture();
  backup.tree.nodes = [service('replacement', 'Replacement service')];
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Restore Backup/ }).click();
  await (await chooserPromise).setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole('button', { name: 'Restore backup', exact: true }).click();
  await page.route('**/api/config', route => route.request().method() === 'GET' ? route.fulfill({ status: 503, json: { error: 'Temporary read failure' } }) : route.fallback());
  await page.getByRole('button', { name: 'Save restored network' }).click();
  await expect(page.locator('[data-select-node="replacement"]')).toBeVisible();
  await expect(page.getByText('Backup restored and saved', { exact: true })).toBeVisible();
});


test('activity chip only shows active counts and clears an expired activity filter', async ({ page }) => {
  const config = fixture();
  config.server.healthCheckInterval = 1000;
  await mockNetwork(page, config);
  let streams = 0, players = 0;
  await page.route('**/api/status', route => route.fulfill({ json: { timestamp: new Date().toISOString(), statuses: {
    plex: { status: 'online', streams, lastChecked: new Date().toISOString() },
    minecraft: { status: 'online', players: { online: players, max: 20 }, lastChecked: new Date().toISOString() },
  } } }));
  await page.goto('/');
  const chip = page.locator('.activity-drill-toggle');
  await expect(chip).toHaveCount(0);
  streams = 2;
  await nextPoll(page);
  await expect(chip).toHaveText('Activity2');
  await chip.click();
  const drill = page.getByRole('complementary', { name: 'Live activity' });
  await expect(drill).toContainText('Plex');
  await expect(drill).toContainText('2streams');
  await expect(page.getByRole('complementary', { name: 'Search results' })).toHaveCount(0);
  streams = 0; players = 1;
  await nextPoll(page);
  await expect(drill).toContainText('1player');
  await expect(drill).not.toContainText('stream');
  players = 0;
  await nextPoll(page);
  await expect(drill).toHaveCount(0);
});


test('mobile inspector edits retain failed drafts and require explicit discard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await mockNetwork(page);
  await page.goto('/');
  await page.locator('[data-select-node="home"]').click();
  await page.getByRole('button', { name: 'Edit node', exact: true }).click();
  await expect(page.locator('.inspector-editor')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Title', { exact: true }).fill('Unsaved title');
  api.failSave();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.inspector-editor-footer [role="alert"]')).toContainText('Simulated save failure');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unsaved title');
  await page.screenshot({ animations: 'disabled', path: 'test-results/mobile-inline-editor.png' });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unsaved title');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.locator('.inspector-editor')).toHaveCount(0);
  await expect(page.locator('.inspector-identity h2')).toHaveText('Home lab');
  expect(api.getConfig().tree.nodes[0].title).toBe('Home lab');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('collapse reauthenticates expired sessions and preserves local state on cancel', async ({ page }) => {
  const api = await mockNetwork(page);
  await page.route('**/api/auth/status', route => route.fulfill({ json: { authDisabled: false } }));
  await page.route('**/api/auth/validate', route => route.fulfill({ status: route.request().headers().authorization === 'Bearer renewed-session' ? 200 : 401, json: {} }));
  await page.route('**/api/auth/login', route => route.fulfill({ json: { success: true, token: 'renewed-session' } }));
  const saveTokens: string[] = [];
  await page.route('**/api/config', async route => {
    if (route.request().method() === 'POST') {
      saveTokens.push(route.request().headers().authorization);
      if (route.request().headers().authorization !== 'Bearer renewed-session') return route.fulfill({ status: 401, json: { message: 'Session expired' } });
    }
    return route.fallback();
  });
  await page.goto('/');
  await expect(page.locator('.node-body')).toHaveCount(27);
  await page.evaluate(() => sessionStorage.setItem('nautilus_auth_token', 'expired-session'));
  await page.getByRole('button', { name: /^Collapse Smart home;/ }).click();
  await expect(page.getByRole('dialog', { name: 'Administrator Login' })).toBeVisible();
  await page.getByLabel('Username', { exact: true }).fill('test-admin');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect.poll(() => flatten(api.getConfig().tree.nodes).find(n => n.id === 'smart-home')?.collapsed).toBe(true);
  expect(saveTokens).toEqual(['Bearer renewed-session']);
  await expect(page.getByText('Collapse preference could not be saved.', { exact: false })).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem('nautilus_auth_token', 'expired-again'));
  await page.getByRole('button', { name: /^Expand Smart home;/ }).click();
  await page.getByRole('dialog', { name: 'Administrator Login' }).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.node-body')).toHaveCount(27);
  expect(api.getWrites()).toBe(1);
  await page.getByRole('button', { name: /^Collapse Smart home;/ }).click();
  await expect(page.locator('.node-body')).toHaveCount(23);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(api.getWrites()).toBe(1);
});

test('home lab is intrinsic and the branch count morphs into its action', async ({ page }) => {
  const config = fixture();
  config.tree.nodes[0] = { id: 'legacy-home', title: 'Homelab', subtitle: '', ip: 'unused', collapsed: true, children: config.tree.nodes[0].children };
  await mockNetwork(page, config);
  await page.goto('/');
  await expect(page.locator('.root-node')).toHaveCount(1);
  await expect(page.locator('.root-node .home-orb')).toBeVisible();
  await expect(page.locator('[data-select-node="legacy-home"]')).toHaveCount(0);
  await expect(page.locator('.root-node .branch-toggle')).toHaveCount(0);
  await expect(page.locator('.radial-world')).toHaveAttribute('data-layout-settled', 'true');
  const branch = page.locator('.radial-node').filter({ has: page.locator('[data-select-node="smart-home"]') });
  // Expanded: no count ring, only a collapse control revealed by hovering the branch's links.
  await expect(branch.locator('.branch-toggle')).toHaveCount(0);
  const collapse = branch.locator('.branch-collapse');
  await expect(collapse).toHaveCSS('opacity', '0');
  // Hover the link bundle just outside the node, short of the control itself.
  const body = (await branch.locator('[data-select-node="smart-home"]').boundingBox())!;
  const box = (await collapse.boundingBox())!;
  const center = { x: body.x + body.width / 2, y: body.y + body.height / 2 };
  const dx = box.x + box.width / 2 - center.x, dy = box.y + box.height / 2 - center.y, length = Math.hypot(dx, dy);
  await page.mouse.move(center.x + dx / length * (body.width / 2 + 7), center.y + dy / length * (body.width / 2 + 7));
  await expect(collapse).toHaveCSS('opacity', '1');
  await collapse.click();
  // Collapsed: the count ring appears and morphs into the expand action on hover.
  const toggle = branch.locator('.branch-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle.locator('.branch-count')).toHaveText('4');
  await expect(branch.locator('.branch-collapse')).toHaveCount(0);
  await toggle.hover();
  await expect(toggle.locator('.branch-count')).toHaveCSS('opacity', '0');
  await expect(toggle.locator('.branch-glyph')).toHaveCSS('opacity', '1');
  await page.mouse.move(5, 180);
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(branch.locator('.branch-toggle')).toHaveCount(0);
  await expect(branch.locator('.branch-collapse')).toHaveAttribute('aria-expanded', 'true');
  await page.mouse.move(5, 180);
  await page.screenshot({ animations: 'disabled', path: 'test-results/intrinsic-home-orb.png' });
});

test('inspector disclosures, switches and delete with preserved children', async ({ page }) => {
  const api = await mockNetwork(page);
  await page.goto('/');
  await page.locator('[data-select-node="media"]').click();
  await page.getByRole('button', { name: 'Edit node', exact: true }).click();
  const editor = page.locator('.inspector-editor');
  const interaction = editor.getByRole('switch', { name: 'Interactable', exact: true });
  await expect(interaction).toHaveAttribute('aria-checked', 'true');
  for (let i = 0; i < 2; i++) {
    const track = await interaction.boundingBox();
    const thumb = await interaction.locator('.switch-thumb').boundingBox();
    expect(thumb!.x).toBeGreaterThan(track!.x);
    expect(thumb!.x + thumb!.width).toBeLessThan(track!.x + track!.width);
    await interaction.click();
    await expect(interaction).toHaveAttribute('aria-checked', i === 0 ? 'false' : 'true');
  }
  await expect(editor.getByRole('button', { name: 'Position in network', exact: true })).toHaveCount(0); // desktop moves on the canvas
  for (const name of ['Backup window']) {
    const disclosure = editor.getByRole('button', { name, exact: true });
    await disclosure.click();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    await disclosure.click();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  }
  await editor.getByRole('button', { name: 'Delete node', exact: true }).click();
  const deletion = editor;
  await expect(deletion.getByRole('radio', { name: /Keep connected nodes/ })).toBeChecked();
  await page.screenshot({ animations: 'disabled', path: 'test-results/inspector-delete-preserve.png' });
  api.failSave();
  await deletion.getByRole('button', { name: 'Delete node', exact: true }).click();
  await expect(editor.getByRole('alert')).toBeVisible();
  expect(flatten(api.getConfig().tree.nodes).some(n => n.id === 'media')).toBe(true);
  api.allowSave();
  await deletion.getByRole('button', { name: 'Delete node', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const ids = api.getConfig().tree.nodes[0].children!.map(n => n.id);
  expect(ids).toEqual(['platform', 'plex', 'sonarr', 'radarr', 'overseerr', 'smart-home', 'storage', 'network']);
  await page.locator('[data-select-node="plex"]').click();
  await page.getByRole('button', { name: 'Edit node', exact: true }).click();
  await editor.getByRole('button', { name: 'Delete node', exact: true }).click();
  await expect(editor.getByRole('radio')).toHaveCount(0);
});

test('edit mode drops a whole branch onto the home lab center and persists its new parent', async ({ page }) => {
  const api = await mockNetwork(page);
  await page.goto('/');
  const source = page.locator('[data-select-node="smart-home"]');
  const center = page.locator('[data-drop-home]');
  await expect(source).toHaveAttribute('draggable', 'false');
  await page.getByRole('button', { name: 'Edit network', exact: true }).click();
  await expect(source).toHaveAttribute('draggable', 'true');
  api.failSave();
  await source.dragTo(center);
  await expect(page.locator('.network-notice[role="alert"]')).toContainText('Simulated save failure');
  expect(api.getConfig().tree.nodes[0].children!.some(n => n.id === 'smart-home')).toBe(true);
  api.allowSave();
  await source.dragTo(center);
  await expect.poll(() => api.getConfig().tree.nodes.some(n => n.id === 'smart-home')).toBe(true);
  expect(api.getConfig().tree.nodes[0].children!.some(n => n.id === 'smart-home')).toBe(false);
  expect(api.getConfig().tree.nodes.find(n => n.id === 'smart-home')!.children!.map(n => n.id)).toEqual(['assistant', 'mqtt', 'zigbee', 'nodered']);
  await expect(center).not.toHaveClass(/accepts-drop/);
  await page.reload();
  await expect(page.locator('[data-select-node="smart-home"]')).toBeVisible();
  expect(api.getConfig().tree.nodes.some(n => n.id === 'smart-home')).toBe(true);
});

test('history accepts a custom date range', async ({ page }) => {
  await mockNetwork(page);
  const queries: URLSearchParams[] = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname === '/api/history') queries.push(url.searchParams); });
  await page.goto('/');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Custom range', exact: true }).click();
  const popover = page.getByRole('dialog', { name: 'Custom range' });
  const day = (offset: number) => { const d = new Date(Date.now() - offset * 86400000); d.setHours(9, 0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  await popover.getByLabel('To').fill(day(3));
  await popover.getByLabel('From').fill(day(2));
  await expect(popover.getByRole('button', { name: 'Apply' })).toBeDisabled(); // end before start
  await popover.getByLabel('From').fill(day(5));
  await popover.getByRole('button', { name: 'Apply' }).click();
  await expect(popover).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Custom range', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => queries.at(-1)?.get('from')).toBe(String(new Date(day(5)).getTime()));
  expect(queries.at(-1)?.get('to')).toBe(String(new Date(day(3)).getTime()));
  await page.keyboard.press('Escape'); // closes the sheet itself, popover is gone
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
