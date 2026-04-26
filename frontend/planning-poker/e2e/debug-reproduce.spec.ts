import { test, expect } from '@playwright/test';

test('joining via invitation URL renders the room UI', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await a.goto('/');
  await a.getByRole('tab', { name: 'Create Room' }).click();
  const ap = a.getByRole('tabpanel');
  await ap.getByLabel('Your Name').fill('Alice');
  await ap.getByRole('button', { name: /Create Room/i }).click();
  await a.waitForURL(/\/room\/[A-Z0-9]+/);
  const roomId = a.url().match(/\/room\/([A-Z0-9]+)/)![1];

  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await b.goto(`/room/${roomId}`);

  const dialog = b.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Your Name').fill('Bob');
  await dialog.getByRole('button', { name: 'Join' }).click();

  await expect(dialog).toBeHidden();
  await expect(b.getByRole('heading', { name: 'People' })).toBeVisible();
  await expect(b.getByText('Bob')).toBeVisible();
  await expect(b.getByText('Alice')).toBeVisible();
  await expect(b.getByRole('heading', { name: 'Choose your estimate' })).toBeVisible();

  await expect(a.getByText('Bob')).toBeVisible();
});
