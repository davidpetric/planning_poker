import { test } from '@playwright/test';

test('visit nonexistent room in fresh browser', async ({ browser }) => {
  const b = await (await browser.newContext()).newPage();
  b.on('console', m => console.log('[console]', m.type(), m.text()));
  b.on('pageerror', e => console.log('[pageerror]', e.message));

  await b.goto(`/room/9S8FYE`);
  await b.waitForTimeout(2000);
  const html = await b.content();
  console.log('DIALOG PRESENT?', html.includes('mat-dialog-container'));
  console.log('APP-ROOM INNER:', html.match(/<app-room[^>]*>[\s\S]*?<\/app-room>/)?.[0].slice(0, 400));
});

test('same-context second tab (shared vs isolated sessionStorage)', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto('/');
  await page.getByRole('tab', { name: 'Create Room' }).click();
  const tp = page.getByRole('tabpanel');
  await tp.getByLabel('Your Name').fill('Alice');
  await tp.getByRole('button', { name: /Create Room/i }).click();
  await page.waitForURL(/\/room\/[A-Z0-9]+/);
  const roomId = page.url().match(/\/room\/([A-Z0-9]+)/)![1];
  console.log('roomId', roomId);
  const stored = await page.evaluate(
    k => sessionStorage.getItem(k),
    `planning-poker-player-${roomId}`,
  );
  console.log('first tab stored playerId:', stored);

  const second = await ctx.newPage();
  second.on('console', m => console.log('[second]', m.type(), m.text()));
  second.on('pageerror', e => console.log('[second pageerror]', e.message));
  await second.goto(`/room/${roomId}`);
  await second.waitForTimeout(2500);
  const storedInSecond = await second.evaluate(
    k => sessionStorage.getItem(k),
    `planning-poker-player-${roomId}`,
  );
  console.log('second tab stored playerId:', storedInSecond);
  const html2 = await second.content();
  console.log('SECOND DIALOG PRESENT?', html2.includes('mat-dialog-container'));
  console.log('SECOND APP-ROOM:', html2.match(/<app-room[^>]*>[\s\S]*?<\/app-room>/)?.[0].slice(0, 400));
});
