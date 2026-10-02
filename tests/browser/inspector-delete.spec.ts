import { test, expect } from '@playwright/test';

test('deletion uses a focused inspector step and preserves edits when returning', async ({ page }, testInfo) => {
  let config = { general: { title: 'Nautilus' }, appearance: { accentColor: '#65d7e8' }, server: { healthCheckInterval: 20000, corsOrigins: [] }, client: { apiPollingInterval: 60000 }, tree: { nodes: [{ id: 'media', title: 'Media services', subtitle: '', icon: 'server', children: [{ id: 'plex', title: 'Plex', subtitle: '' }, { id: 'sonarr', title: 'Sonarr', subtitle: '' }] }] } };
  let failSave = false;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/config') {
      if (route.request().method() === 'POST') {
        if (failSave) return route.fulfill({ status: 500, json: { error: 'Save failed' } });
        config = route.request().postDataJSON();
      }
      return route.fulfill({ json: config });
    }
    return route.fulfill({ json: path === '/api/auth/status' ? { authDisabled: true } : path === '/api/status' ? { statuses: {}, timestamp: new Date().toISOString() } : {} });
  });
  await page.goto('/');
  await page.locator('[data-select-node="media"]').click();
  await page.getByRole('button', { name: 'Edit node', exact: true }).click();
  const editor = page.locator('.inspector-editor');
  await editor.getByLabel('Title', { exact: true }).fill('Media draft');
  await editor.getByRole('button', { name: 'Delete node', exact: true }).click();
  await expect(editor.getByRole('heading', { name: 'Media services', exact: true })).toBeFocused();
  await expect(editor.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(editor.getByLabel('Title', { exact: true })).toHaveCount(0);
  await expect(editor.getByRole('radio', { name: /Keep connected nodes/ })).toBeChecked();
  await expect(editor).toContainText('1 node will be deleted');
  await page.screenshot({ path: testInfo.outputPath('delete-desktop.png'), animations: 'disabled' });
  await editor.getByRole('radio', { name: /Delete the entire branch/ }).check();
  await expect(editor).toContainText('3 nodes will be deleted');
  await expect(editor.getByRole('button', { name: 'Delete branch', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor.getByLabel('Title', { exact: true })).toHaveValue('Media draft');
  await editor.getByRole('button', { name: 'Delete node', exact: true }).click();
  await editor.getByRole('radio', { name: /Keep connected nodes/ }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('delete-mobile.png'), animations: 'disabled' });
  failSave = true;
  await editor.getByRole('button', { name: 'Delete node', exact: true }).click();
  await expect(editor.getByRole('alert')).toBeVisible();
  expect(config.tree.nodes[0].id).toBe('media');
  failSave = false;
  await editor.getByRole('button', { name: 'Delete node', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(config.tree.nodes.map(n => n.id)).toEqual(['plex', 'sonarr']);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page.locator('[data-select-node="plex"]').click();
  await page.getByRole('button', { name: 'Edit node', exact: true }).click();
  await editor.getByRole('button', { name: 'Delete node', exact: true }).click();
  await expect(editor.getByRole('radio')).toHaveCount(0);
});
