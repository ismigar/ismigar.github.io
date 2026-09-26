import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

const id = '0d63b4cb-09c0-41f2-a930-4a6724f51347';
const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
const submission = {
  id, kind: 'vault-template', filename: 'study-1.0.0.gnosi-vault.zip',
  sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length,
  status: 'quarantined', metadata: { id: 'study', name: 'Study contribution', version: '1.0.0',
    author: 'Example contributor', license: 'CC-BY-4.0', description: 'Original public study notes.' },
  createdAt: '2026-09-26T10:00:00Z', reviewedBy: null, reviewedAt: null, reviewNotes: '',
};

test('reviews a contribution, verifies the download and prepares its release receipt', async ({ page }, testInfo) => {
  let status = 'quarantined';
  const decisions: unknown[] = [];
  await page.route('**/api/dashboard?**', (route) => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.route('**/api/marketplace/submissions?**', (route) => {
    const filter = new URL(route.request().url()).searchParams.get('status');
    return route.fulfill({ json: { submissions: filter === status || filter === 'all' ? [{ ...submission, status,
      reviewedBy: status === 'approved' ? 'maintainer' : null, reviewedAt: status === 'approved' ? '2026-09-26T12:00:00Z' : null }] : [], nextCursor: null } });
  });
  await page.route(`**/api/marketplace/submissions/${id}/package`, (route) => route.fulfill({ body: bytes, contentType: 'application/zip' }));
  await page.route(`**/api/marketplace/submissions/${id}/receipt`, (route) => route.fulfill({ json: { ...submission, submissionId: id, schemaVersion: 1, status: 'approved' } }));
  await page.route(`**/api/marketplace/submissions/${id}/decision`, async (route) => {
    const body = route.request().postDataJSON(); decisions.push(body); status = body.decision;
    await route.fulfill({ json: { id, status } });
  });
  await page.goto('/?view=marketplace');
  await page.getByRole('button', { name: /Study contribution/ }).click();
  await expect(page.getByRole('button', { name: 'Aprova', exact: true })).toBeDisabled();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descarrega el paquet' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(submission.filename);
  await page.getByLabel('Notes de revisió').fill('Files, authorship and privacy reviewed.');
  await page.getByLabel('He revisat els fitxers, la llicència i la privacitat.').check();
  await page.getByRole('button', { name: 'Aprova', exact: true }).click();
  await expect(page.getByText('L’aportació quedarà aprovada', { exact: false })).toBeVisible();
  expect(decisions).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirma la decisió' }).click();
  await expect(page.getByText('Decisió desada.')).toBeVisible();
  expect(decisions).toEqual([{ decision: 'approved', notes: 'Files, authorship and privacy reviewed.' }]);
  await page.getByRole('button', { name: 'Aprovades', exact: true }).click();
  await page.getByRole('button', { name: /Study contribution/ }).click();
  await expect(page.getByRole('heading', { name: 'Prepara la publicació' })).toBeVisible();
  const receiptPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descarrega el comprovant' }).click();
  expect((await receiptPromise).suggestedFilename()).toBe(`${id}.review.json`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('marketplace.png'), fullPage: true });
  await page.getByRole('button', { name: 'FR', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Révision des modèles et extensions' })).toBeVisible();
});

test('shows a recoverable queue error and requires confirmation before rejecting', async ({ page }) => {
  let failed = true;
  let decisions = 0;
  await page.route('**/api/marketplace/submissions?**', (route) => route.fulfill(failed
    ? { status: 503, json: { error: 'offline' } }
    : { json: { submissions: [submission], nextCursor: null } }));
  await page.route(`**/api/marketplace/submissions/${id}/decision`, (route) => {
    decisions += 1; return route.fulfill({ json: { status: 'rejected' } });
  });
  await page.goto('/?view=marketplace');
  await expect(page.getByRole('alert')).toHaveText('No s’ha pogut carregar la cua. Torna-ho a provar.');
  failed = false;
  await page.getByRole('button', { name: 'Actualitza', exact: true }).click();
  await page.getByRole('button', { name: /Study contribution/ }).click();
  await page.getByLabel('Notes de revisió').fill('Contains private information.');
  await page.getByRole('button', { name: 'Rebutja', exact: true }).click();
  await expect(page.getByText('Es conservarà el registre', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel·la', exact: true }).click();
  expect(decisions).toBe(0);
  await page.getByRole('button', { name: 'Rebutja', exact: true }).click();
  await page.getByRole('button', { name: 'Confirma la decisió' }).click();
  await expect(page.getByText('Decisió desada.')).toBeVisible();
  expect(decisions).toBe(1);
});
