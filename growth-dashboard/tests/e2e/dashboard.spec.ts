import { expect, test } from '@playwright/test';
import { demoData } from '../../src/demo';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/dashboard?**', async (route) => {
    await route.fulfill({ json: demoData });
  });
});

test('renders the complete growth story and changes date range', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'De la descoberta a la comunitat' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Del descobriment a la descàrrega' })).toBeVisible();
  await expect(page.getByText('Descàrregues confirmades')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Participació i confiança' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Patrocinis' })).toBeVisible();
  await page.getByRole('button', { name: '7 dies' }).click();
  await expect(page.getByRole('button', { name: '7 dies' })).toHaveAttribute('aria-pressed', 'true');
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
