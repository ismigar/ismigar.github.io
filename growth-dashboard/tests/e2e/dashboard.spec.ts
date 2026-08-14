import { expect, test } from '@playwright/test';
import { demoData } from '../../src/demo';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/dashboard?**', async (route) => {
    await route.fulfill({ json: demoData });
  });
  await page.route('**/api/sync?source=github', async (route) => {
    await route.fulfill({ json: { synced: 'github' } });
  });
  await page.route('**/api/import/alternativeto', async (route) => {
    await route.fulfill({ json: { imported: true } });
  });
});

test('renders the complete growth story and changes date range', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'De la descoberta a la comunitat' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'De la descoberta a la descàrrega' })).toBeVisible();
  await expect(page.getByText('Noves descàrregues d’instal·ladors')).toBeVisible();
  await expect(page.getByText('Aquestes xifres no formen un embut de conversió', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Participació i confiança' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Patrocinis' })).toBeVisible();
  await page.getByRole('button', { name: '7 dies' }).click();
  await expect(page.getByRole('button', { name: '7 dies' })).toHaveAttribute('aria-pressed', 'true');
});

test('switches the complete dashboard between Catalan, Spanish, and English', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ES', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Del descubrimiento a la comunidad' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Del descubrimiento a la descarga' })).toBeVisible();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'From discovery to community' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'From discovery to download' })).toBeVisible();
  await expect(page.getByTitle('partial')).toContainText('GitHub Sponsors');
  await expect(page.getByTitle('Actualització pendent')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'From discovery to community' })).toBeVisible();
});

test('runs an authenticated GitHub synchronization and refreshes the dashboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sincronitza GitHub' }).click();
  await expect(page.getByRole('status')).toHaveText('GitHub actualitzat', { timeout: 10_000 });
});

test('imports a manual AlternativeTo snapshot', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Actualitza les dades' }).click();
  await page.getByLabel('Likes').fill('1');
  await page.getByRole('button', { name: 'Desa el snapshot' }).click();
  await expect(page.getByRole('status')).toHaveText('AlternativeTo actualitzat');
});

test('keeps the dashboard readable on a mobile viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible();
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBe(false);
});
