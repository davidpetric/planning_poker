import { test, expect, Browser, Page, Locator } from '@playwright/test';

// ---------- helpers ----------

async function newUserPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

async function createRoom(page: Page, playerName: string): Promise<string> {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Create Room' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Create Room' });
  await panel.getByLabel('Your Name').fill(playerName);
  await panel.getByRole('button', { name: /Create Room/i }).click();
  await page.waitForURL(/\/room\/[A-Z0-9]+/);
  const match = page.url().match(/\/room\/([A-Z0-9]+)/);
  expect(match).not.toBeNull();
  return match![1];
}

async function joinRoomByUrl(page: Page, roomId: string, playerName: string): Promise<void> {
  await page.goto(`/room/${roomId}`);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Your Name').fill(playerName);
  await dialog.getByRole('button', { name: /^Join$/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.room-id')).toContainText(roomId);
}

async function joinRoomFromHome(page: Page, roomId: string, playerName: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Join Room' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Join Room' });
  await panel.getByLabel('Your Name').fill(playerName);
  await panel.getByLabel('Room ID').fill(roomId);
  await panel.getByRole('button', { name: /Join Room/i }).click();
}

function playerRow(page: Page, name: string): Locator {
  return page.locator('.player-row', {
    has: page.locator('.player-name', { hasText: new RegExp(`^${name}$`) }),
  });
}

async function selectCard(page: Page, value: string): Promise<void> {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.locator('.poker-card', { hasText: new RegExp(`^${escaped}$`) }).click();
}

function cardByValue(page: Page, value: string): Locator {
  return page.locator('.poker-card', { hasText: new RegExp(`^${value}$`) });
}

async function reveal(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Show Votes/i }).click();
}

async function newVoting(page: Page): Promise<void> {
  await page.getByRole('button', { name: /New Voting/i }).click();
}

// ============================================================
// 1. Core multi-user synchronization
// ============================================================

test.describe('Core multi-user sync', () => {
  test('two users see each other after one joins via shared link', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);

    const roomId = await createRoom(alice, 'Alice');
    await expect(alice.locator('.room-id')).toHaveText(`Room ID: ${roomId}`);
    await expect(playerRow(alice, 'Alice')).toBeVisible();

    await joinRoomByUrl(bob, roomId, 'Bob');

    for (const p of [alice, bob]) {
      await expect(playerRow(p, 'Alice')).toBeVisible();
      await expect(playerRow(p, 'Bob')).toBeVisible();
      await expect(playerRow(p, 'Alice').locator('.host-badge')).toBeVisible();
      await expect(playerRow(p, 'Bob').locator('.host-badge')).toHaveCount(0);
    }
  });

  test('three users vote; reveal shows values and average on all pages', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const carol = await newUserPage(browser);

    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');
    await joinRoomByUrl(carol, roomId, 'Carol');

    for (const p of [alice, bob, carol]) {
      await expect(p.locator('.player-row')).toHaveCount(3);
    }

    await selectCard(alice, '5');
    await selectCard(bob, '8');
    await selectCard(carol, '9');

    await reveal(alice);

    for (const p of [alice, bob, carol]) {
      await expect(p.locator('.average strong')).toHaveText('7.3');
      await expect(playerRow(p, 'Alice').locator('.vote-value')).toHaveText('5');
      await expect(playerRow(p, 'Bob').locator('.vote-value')).toHaveText('8');
      await expect(playerRow(p, 'Carol').locator('.vote-value')).toHaveText('9');
    }
  });

  test('New Voting resets everyone and re-enables card deck', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    await selectCard(alice, '3');
    await selectCard(bob, '9');
    await reveal(alice);
    await expect(alice.locator('.average strong')).toHaveText('6.0');

    await newVoting(alice);

    for (const p of [alice, bob]) {
      await expect(p.locator('.voted-count')).toHaveText('0 / 2 voted');
      await expect(p.locator('.card-deck')).toBeVisible();
      await expect(playerRow(p, 'Alice').locator('.vote-empty')).toBeVisible();
      await expect(playerRow(p, 'Bob').locator('.vote-empty')).toBeVisible();
    }
  });

  test('vote-hidden state shows a check mark on other players while votes are hidden', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    await selectCard(alice, '5');
    await selectCard(bob, '8');

    for (const p of [alice, bob]) {
      await expect(p.locator('.voted-count')).toHaveText('2 / 2 voted');
      await expect(playerRow(p, 'Alice').locator('.vote-check')).toBeVisible();
      await expect(playerRow(p, 'Bob').locator('.vote-check')).toBeVisible();
      // No values leaked while hidden
      await expect(playerRow(p, 'Alice').locator('.vote-value')).toHaveCount(0);
      await expect(playerRow(p, 'Bob').locator('.vote-value')).toHaveCount(0);
    }
  });
});

// ============================================================
// 2. Voting UX edge cases
// ============================================================

test.describe('Voting UX', () => {
  test('Show Votes is disabled until someone votes', async ({ browser }) => {
    const alice = await newUserPage(browser);
    await createRoom(alice, 'Alice');
    const button = alice.getByRole('button', { name: /Show Votes/i });
    await expect(button).toBeDisabled();
    await selectCard(alice, '3');
    await expect(button).toBeEnabled();
  });

  test('toggling the same card un-votes the player', async ({ browser }) => {
    const alice = await newUserPage(browser);
    await createRoom(alice, 'Alice');

    await selectCard(alice, '8');
    await expect(alice.locator('.voted-count')).toHaveText('1 / 1 voted');
    await expect(playerRow(alice, 'Alice').locator('.vote-check')).toBeVisible();

    await selectCard(alice, '8');
    await expect(alice.locator('.voted-count')).toHaveText('0 / 1 voted');
    await expect(playerRow(alice, 'Alice').locator('.vote-empty')).toBeVisible();
  });

  test('changing vote replaces previous value; only one card is selected', async ({ browser }) => {
    const alice = await newUserPage(browser);
    await createRoom(alice, 'Alice');

    await selectCard(alice, '5');
    await expect(cardByValue(alice, '5')).toHaveClass(/selected/);
    await expect(alice.locator('.poker-card.selected')).toHaveCount(1);

    await selectCard(alice, '9');
    await expect(cardByValue(alice, '5')).not.toHaveClass(/selected/);
    await expect(cardByValue(alice, '9')).toHaveClass(/selected/);
    await expect(alice.locator('.poker-card.selected')).toHaveCount(1);
    await expect(alice.locator('.voted-count')).toHaveText('1 / 1 voted');

    await reveal(alice);
    await expect(playerRow(alice, 'Alice').locator('.vote-value')).toHaveText('9');
  });

  test('? card is excluded from the numeric average', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    await selectCard(alice, '9');
    await selectCard(bob, '?');
    await reveal(alice);

    await expect(alice.locator('.average strong')).toHaveText('9.0');
    await expect(playerRow(alice, 'Bob').locator('.vote-value')).toHaveText('?');
  });

  test('reveal with partial votes averages only the voters', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const carol = await newUserPage(browser);

    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');
    await joinRoomByUrl(carol, roomId, 'Carol');

    await selectCard(alice, '5');
    await selectCard(bob, '3');
    // Carol abstains
    await reveal(alice);

    for (const p of [alice, bob, carol]) {
      await expect(p.locator('.average strong')).toHaveText('4.0');
      await expect(playerRow(p, 'Carol').locator('.vote-empty')).toBeVisible();
    }
  });

  test('no numeric votes produces a "-" average', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    await selectCard(alice, '?');
    await selectCard(bob, '?');
    await reveal(alice);

    await expect(alice.locator('.average strong')).toHaveText('-');
  });

  test('card deck is hidden after reveal and returns on New Voting', async ({ browser }) => {
    const alice = await newUserPage(browser);
    await createRoom(alice, 'Alice');
    await selectCard(alice, '8');
    await reveal(alice);
    await expect(alice.locator('.card-deck')).toHaveCount(0);

    await newVoting(alice);
    await expect(alice.locator('.card-deck')).toBeVisible();
    await expect(alice.locator('.poker-card')).toHaveCount(11);
  });
});

// ============================================================
// 3. Host vs non-host permissions
// ============================================================

test.describe('Host privileges', () => {
  test('host sees remove buttons on others but not on self', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    await expect(playerRow(alice, 'Alice').locator('.remove-btn')).toHaveCount(0);
    await expect(playerRow(alice, 'Bob').locator('.remove-btn')).toBeVisible();
  });

  test('non-host sees no remove buttons anywhere', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    await expect(bob.locator('.remove-btn')).toHaveCount(0);
  });

  test('host removes player; kicked page is torn down, host list updates', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    await expect(playerRow(alice, 'Bob')).toBeVisible();
    await playerRow(alice, 'Bob').locator('.remove-btn').click();

    await expect(playerRow(alice, 'Bob')).toHaveCount(0);
    await expect(alice.locator('.voted-count')).toHaveText('0 / 1 voted');
    await expect(bob.locator('.player-list')).toHaveCount(0);
  });
});

// ============================================================
// 4. Session persistence / reconnection
// ============================================================

test.describe('Session persistence', () => {
  test('reload after creating stays in room without showing join dialog', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await expect(playerRow(alice, 'Alice')).toBeVisible();

    await alice.reload();

    await expect(alice.getByRole('dialog')).toHaveCount(0);
    await expect(alice.locator('.room-id')).toContainText(roomId);
    await expect(playerRow(alice, 'Alice')).toBeVisible();
  });

  test('reload after joining stays in room without showing join dialog', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    await bob.reload();

    await expect(bob.getByRole('dialog')).toHaveCount(0);
    await expect(bob.locator('.room-id')).toContainText(roomId);
    await expect(playerRow(bob, 'Alice')).toBeVisible();
    await expect(playerRow(bob, 'Bob')).toBeVisible();
  });

  test('navigating home and back via brand link re-joins the room via stored session', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');

    await alice.locator('.brand').click();
    await alice.waitForURL('**/');
    await expect(alice.getByRole('tab', { name: 'Create Room' })).toBeVisible();

    await alice.goto(`/room/${roomId}`);
    await expect(alice.getByRole('dialog')).toHaveCount(0);
    await expect(playerRow(alice, 'Alice')).toBeVisible();
  });

  test('direct URL in a fresh browser always shows the join dialog', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');

    await bob.goto(`/room/${roomId}`);
    await expect(bob.getByRole('dialog')).toBeVisible();
  });
});

// ============================================================
// 5. Late-joiner state catch-up
// ============================================================

test.describe('Late joiners', () => {
  test('late joiner sees existing hidden votes as check marks', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await selectCard(alice, '5');

    const bob = await newUserPage(browser);
    await joinRoomByUrl(bob, roomId, 'Bob');

    await expect(playerRow(bob, 'Alice').locator('.vote-check')).toBeVisible();
    await expect(playerRow(bob, 'Alice').locator('.vote-value')).toHaveCount(0);
    await expect(bob.locator('.voted-count')).toHaveText('1 / 2 voted');
  });

  test('late joiner walks into a revealed room and sees the numbers', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await selectCard(alice, '8');
    await reveal(alice);

    const bob = await newUserPage(browser);
    await joinRoomByUrl(bob, roomId, 'Bob');

    await expect(playerRow(bob, 'Alice').locator('.vote-value')).toHaveText('8');
    await expect(bob.locator('.card-deck')).toHaveCount(0);
    await expect(bob.locator('.average strong')).toHaveText('8.0');
  });
});

// ============================================================
// 6. Leave and cleanup
// ============================================================

test.describe('Leaving', () => {
  test('leaving returns to home and drops the player from others', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    await bob.getByRole('button', { name: /Leave/i }).click();
    await bob.waitForURL('**/');

    await expect(playerRow(alice, 'Bob')).toHaveCount(0);
    await expect(alice.locator('.voted-count')).toHaveText('0 / 1 voted');
  });

  test('after leaving, the same user can create another room', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const firstRoom = await createRoom(alice, 'Alice');
    await alice.getByRole('button', { name: /Leave/i }).click();
    await alice.waitForURL('**/');

    const secondRoom = await createRoom(alice, 'Alice');
    expect(secondRoom).not.toBe(firstRoom);
    await expect(alice.locator('.room-id')).toContainText(secondRoom);
    await expect(playerRow(alice, 'Alice')).toBeVisible();
  });
});

// ============================================================
// 7. Home-page form behavior and errors
// ============================================================

test.describe('Home page', () => {
  test('Create Room button is disabled without a player name', async ({ browser }) => {
    const page = await newUserPage(browser);
    await page.goto('/');
    await page.getByRole('tab', { name: 'Create Room' }).click();
    const panel = page.getByRole('tabpanel');
    const btn = panel.getByRole('button', { name: /Create Room/i });
    await expect(btn).toBeDisabled();

    await panel.getByLabel('Your Name').fill('Alice');
    await expect(btn).toBeEnabled();
  });

  test('Join Room button is disabled until both name and room id are filled', async ({ browser }) => {
    const page = await newUserPage(browser);
    await page.goto('/');
    await page.getByRole('tab', { name: 'Join Room' }).click();
    const panel = page.getByRole('tabpanel');
    const btn = panel.getByRole('button', { name: /Join Room/i });
    await expect(btn).toBeDisabled();

    await panel.getByLabel('Your Name').fill('Alice');
    await expect(btn).toBeDisabled();

    await panel.getByLabel('Room ID').fill('ABCDEF');
    await expect(btn).toBeEnabled();
  });

  test('joining a nonexistent room from home shows an inline error', async ({ browser }) => {
    const page = await newUserPage(browser);
    await joinRoomFromHome(page, 'ZZZZZZ', 'Alice');
    await expect(page.locator('.error-message')).toContainText(/not found/i);
    await expect(page).toHaveURL(/\/$|\/(?!room\/)/);
  });

  test('room id is auto-uppercased when joining from home', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');

    await joinRoomFromHome(bob, roomId.toLowerCase(), 'Bob');
    await bob.waitForURL(new RegExp(`/room/${roomId}$`));
    await expect(playerRow(bob, 'Bob')).toBeVisible();
  });
});

// ============================================================
// 8. Join-dialog error paths
// ============================================================

test.describe('Join dialog', () => {
  test('cancel on the join dialog sends the user home', async ({ browser }) => {
    const page = await newUserPage(browser);
    await page.goto('/room/NOPE12');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForURL('**/');
    await expect(page.getByRole('tab', { name: 'Create Room' })).toBeVisible();
  });

  test('submitting the dialog for an invalid room shows a snackbar and navigates home', async ({ browser }) => {
    const page = await newUserPage(browser);
    await page.goto('/room/BADBAD');
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Your Name').fill('Ghost');
    await dialog.getByRole('button', { name: /^Join$/ }).click();

    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/not found/i);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForURL('**/');
  });
});

// ============================================================
// 9. Invite dialog
// ============================================================

test.describe('Invite dialog', () => {
  test('shows the shareable link and room id, closes on Close', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');

    await alice.getByRole('button', { name: /Invite/i }).click();
    const dialog = alice.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expect(dialog.getByLabel('Room Link')).toHaveValue(new RegExp(`/room/${roomId}$`));
    await expect(dialog.getByLabel('Room ID')).toHaveValue(roomId);

    await dialog.getByRole('button', { name: /Close/i }).click();
    await expect(dialog).toBeHidden();
  });
});

// ============================================================
// 10. Theme toggle
// ============================================================

test.describe('Theme', () => {
  test('theme toggle flips the dark-mode class on <html>', async ({ browser }) => {
    const page = await newUserPage(browser);
    await page.goto('/');

    const initial = await page.evaluate(() =>
      document.documentElement.classList.contains('dark-mode'),
    );

    await page.locator('.theme-toggle').click();

    const html = page.locator('html');
    if (initial) {
      await expect(html).not.toHaveClass(/(?:^|\s)dark-mode(?:\s|$)/);
    } else {
      await expect(html).toHaveClass(/(?:^|\s)dark-mode(?:\s|$)/);
    }
  });
});

// ============================================================
// 11. Duplicate name validation
// ============================================================

test.describe('Duplicate names', () => {
  test('joining via URL with a name already in the room shows an inline error and lets the user retry', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    const carol = await newUserPage(browser);
    await carol.goto(`/room/${roomId}`);
    const dialog = carol.getByRole('dialog');
    await dialog.getByLabel('Your Name').fill('Bob');
    await dialog.getByRole('button', { name: /^Join$/ }).click();

    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/already taken/i);

    await dialog.getByLabel('Your Name').fill('Carol');
    await dialog.getByRole('button', { name: /^Join$/ }).click();
    await expect(dialog).toBeHidden();
    await expect(playerRow(carol, 'Carol')).toBeVisible();
  });

  test('case-insensitive: joining with a different-case duplicate is rejected', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');

    const bob = await newUserPage(browser);
    await bob.goto(`/room/${roomId}`);
    const dialog = bob.getByRole('dialog');
    await dialog.getByLabel('Your Name').fill('alice');
    await dialog.getByRole('button', { name: /^Join$/ }).click();
    await expect(dialog).toContainText(/already taken/i);
  });

  test('joining from home with a duplicate name shows an inline error', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    const carol = await newUserPage(browser);
    await joinRoomFromHome(carol, roomId, 'Bob');
    await expect(carol.locator('.error-message')).toContainText(/already taken/i);
    await expect(carol).toHaveURL(/\/$/);
  });
});

// ============================================================
// 12. Create form (no room name)
// ============================================================

test.describe('Create form (no room name)', () => {
  test('Create Room form does not include a room name input', async ({ browser }) => {
    const page = await newUserPage(browser);
    await page.goto('/');
    await page.getByRole('tab', { name: 'Create Room' }).click();
    const panel = page.getByRole('tabpanel', { name: 'Create Room' });
    await expect(panel.getByLabel(/Room Name/i)).toHaveCount(0);
    await expect(panel.getByLabel('Your Name')).toBeVisible();
  });

  test('room header shows the room id and no separate name title', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await expect(alice.locator('.room-info h2')).toHaveCount(0);
    await expect(alice.locator('.room-id')).toContainText(roomId);
  });
});

// ============================================================
// 13. Room settings (host-only)
// ============================================================

test.describe('Room settings (host-only)', () => {
  test('non-host does not see the Settings button', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');
    await expect(bob.getByRole('button', { name: /Settings/i })).toHaveCount(0);
    await expect(alice.getByRole('button', { name: /Settings/i })).toBeVisible();
  });

  test('host switches the deck to T-shirt sizes; everyone sees the new cards', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    await alice.getByRole('button', { name: /Settings/i }).click();
    const dialog = alice.getByRole('dialog');
    await dialog.getByLabel('Deck').click();
    await alice.getByRole('option', { name: 'T-shirt sizes' }).click();
    await dialog.getByRole('button', { name: 'Apply' }).click();

    for (const p of [alice, bob]) {
      await expect(p.locator('.poker-card')).toHaveCount(7);
      await expect(p.locator('.poker-card', { hasText: /^XL$/ })).toBeVisible();
      await expect(p.locator('.poker-card', { hasText: /^XS$/ })).toBeVisible();
    }
  });

  test('changing the deck clears in-progress votes', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    await selectCard(alice, '5');
    await selectCard(bob, '8');
    await expect(alice.locator('.voted-count')).toHaveText('2 / 2 voted');

    await alice.getByRole('button', { name: /Settings/i }).click();
    const dialog = alice.getByRole('dialog');
    await dialog.getByLabel('Deck').click();
    await alice.getByRole('option', { name: 'Powers of 2' }).click();
    await dialog.getByRole('button', { name: 'Apply' }).click();

    await expect(alice.locator('.voted-count')).toHaveText('0 / 2 voted');
    await expect(playerRow(alice, 'Alice').locator('.vote-empty')).toBeVisible();
    await expect(playerRow(alice, 'Bob').locator('.vote-empty')).toBeVisible();
  });

  test('changing the deck while votes are revealed un-reveals them', async ({ browser }) => {
    const alice = await newUserPage(browser);
    await createRoom(alice, 'Alice');
    await selectCard(alice, '5');
    await reveal(alice);
    await expect(alice.locator('.average')).toBeVisible();

    await alice.getByRole('button', { name: /Settings/i }).click();
    const dialog = alice.getByRole('dialog');
    await dialog.getByLabel('Deck').click();
    await alice.getByRole('option', { name: 'T-shirt sizes' }).click();
    await dialog.getByRole('button', { name: 'Apply' }).click();

    await expect(alice.locator('.average')).toHaveCount(0);
    await expect(alice.locator('.card-deck')).toBeVisible();
  });

  test('custom values: comma-separated input becomes the deck', async ({ browser }) => {
    const alice = await newUserPage(browser);
    await createRoom(alice, 'Alice');
    await alice.getByRole('button', { name: /Settings/i }).click();
    const dialog = alice.getByRole('dialog');
    await dialog.getByLabel('Deck').click();
    await alice.getByRole('option', { name: 'Custom…' }).click();
    await dialog.getByLabel('Card values (comma-separated)').fill('1, 2, 3, ?');
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(alice.locator('.poker-card')).toHaveCount(4);
  });

  test('Apply is disabled when fewer than 2 valid cards are entered', async ({ browser }) => {
    const alice = await newUserPage(browser);
    await createRoom(alice, 'Alice');
    await alice.getByRole('button', { name: /Settings/i }).click();
    const dialog = alice.getByRole('dialog');
    await dialog.getByLabel('Deck').click();
    await alice.getByRole('option', { name: 'Custom…' }).click();
    await dialog.getByLabel('Card values (comma-separated)').fill('only');
    await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await expect(dialog).toContainText(/at least 2 cards/i);
  });
});

// ============================================================
// 14. Host-only reveal / reset
// ============================================================

test.describe('Host-only reveal / reset', () => {
  test('default: non-host sees Show Votes disabled with a tooltip', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    await selectCard(alice, '5');
    await expect(bob.getByRole('button', { name: /Show Votes/i })).toBeDisabled();
    await expect(alice.getByRole('button', { name: /Show Votes/i })).toBeEnabled();
  });

  test('default: non-host sees New Voting disabled after reveal', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');
    await selectCard(alice, '5');
    await reveal(alice);

    await expect(bob.getByRole('button', { name: /New Voting/i })).toBeDisabled();
    await expect(alice.getByRole('button', { name: /New Voting/i })).toBeEnabled();
  });

  test('host turns the toggle off; non-host can then reveal and reset', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    await alice.getByRole('button', { name: /Settings/i }).click();
    const dialog = alice.getByRole('dialog');
    await dialog.getByRole('switch', { name: /Only host can reveal/i }).click();
    await dialog.getByRole('button', { name: 'Apply' }).click();

    await selectCard(alice, '5');
    await selectCard(bob, '8');
    await expect(alice.locator('.voted-count')).toHaveText('2 / 2 voted');

    await bob.getByRole('button', { name: /Show Votes/i }).click();
    await expect(alice.locator('.average')).toBeVisible();

    await bob.getByRole('button', { name: /New Voting/i }).click();
    await expect(alice.locator('.voted-count')).toHaveText('0 / 2 voted');
  });

  test('flipping only the lock does not clear existing votes', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    await selectCard(alice, '5');
    await selectCard(bob, '8');

    await alice.getByRole('button', { name: /Settings/i }).click();
    const dialog = alice.getByRole('dialog');
    await dialog.getByRole('switch', { name: /Only host can reveal/i }).click();
    await dialog.getByRole('button', { name: 'Apply' }).click();

    await expect(alice.locator('.voted-count')).toHaveText('2 / 2 voted');
  });
});

// ============================================================
// 15. Remembered name + persistent rooms
// ============================================================

test.describe('Remembered name + persistent rooms', () => {
  test('home pre-fills Your Name from localStorage', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('planning-poker-name', 'Sam'));
    await page.reload();

    const create = page.getByRole('tabpanel', { name: 'Create Room' });
    await expect(create.getByLabel('Your Name')).toHaveValue('Sam');

    await page.getByRole('tab', { name: 'Join Room' }).click();
    const join = page.getByRole('tabpanel', { name: 'Join Room' });
    await expect(join.getByLabel('Your Name')).toHaveValue('Sam');
  });

  test('createRoom stores the name in localStorage', async ({ browser }) => {
    const alice = await newUserPage(browser);
    await createRoom(alice, 'Alice');
    const stored = await alice.evaluate(() => localStorage.getItem('planning-poker-name'));
    expect(stored).toBe('Alice');
  });

  test('URL invitation: stored name auto-joins without showing the dialog', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');

    const ctxB = await browser.newContext();
    const bob = await ctxB.newPage();
    await bob.goto('/');
    await bob.evaluate(() => localStorage.setItem('planning-poker-name', 'Bob'));
    await bob.goto(`/room/${roomId}`);

    await expect(playerRow(bob, 'Bob')).toBeVisible();
    await expect(bob.getByRole('dialog')).toHaveCount(0);
    await expect(playerRow(alice, 'Bob')).toBeVisible();
  });

  test('URL invitation: stored name that clashes falls back to dialog with error', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    const ctxC = await browser.newContext();
    const carol = await ctxC.newPage();
    await carol.goto('/');
    await carol.evaluate(() => localStorage.setItem('planning-poker-name', 'Bob'));
    await carol.goto(`/room/${roomId}`);

    const dialog = carol.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/already taken/i);
    await expect(dialog.getByLabel('Your Name')).toHaveValue('Bob');
  });

  test('empty room persists: host leaves, fresh user via link rejoins as new host with original deck', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');

    await alice.getByRole('button', { name: /Settings/i }).click();
    const dialog = alice.getByRole('dialog');
    await dialog.getByLabel('Deck').click();
    await alice.getByRole('option', { name: 'T-shirt sizes' }).click();
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(dialog).toBeHidden();

    await alice.getByRole('button', { name: /Leave/i }).click();
    await alice.waitForURL('**/');

    const bob = await newUserPage(browser);
    await joinRoomByUrl(bob, roomId, 'Bob');

    await expect(playerRow(bob, 'Bob').locator('.host-badge')).toBeVisible();
    await expect(bob.locator('.poker-card', { hasText: /^XL$/ })).toBeVisible();
    await expect(bob.locator('.poker-card', { hasText: /^XS$/ })).toBeVisible();
  });

  test('empty room persists: hostOnlyControls toggle survives an empty period', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');

    await alice.getByRole('button', { name: /Settings/i }).click();
    const dialog = alice.getByRole('dialog');
    await dialog.getByRole('switch', { name: /Only host can reveal/i }).click();
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(dialog).toBeHidden();

    await alice.getByRole('button', { name: /Leave/i }).click();
    await alice.waitForURL('**/');

    const bob = await newUserPage(browser);
    const carol = await newUserPage(browser);
    await joinRoomByUrl(bob, roomId, 'Bob');
    await joinRoomByUrl(carol, roomId, 'Carol');

    await selectCard(bob, '5');
    await expect(carol.getByRole('button', { name: /Show Votes/i })).toBeEnabled();
  });
});

// ============================================================
// 16. Recent rooms list on home
// ============================================================

test.describe('Recent rooms list on home', () => {
  test('section is hidden when no rooms are stored', async ({ browser }) => {
    const page = await newUserPage(browser);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your rooms' })).toHaveCount(0);
  });

  test('a created room shows up in Your rooms after Leave', async ({ browser }) => {
    const page = await newUserPage(browser);
    const roomId = await createRoom(page, 'Alice');
    await page.getByRole('button', { name: /Leave/i }).click();
    await page.waitForURL('**/');

    await expect(page.getByRole('heading', { name: 'Your rooms' })).toBeVisible();
    await expect(page.locator('.room-row', { hasText: roomId })).toBeVisible();
  });

  test('clicking a remembered room rejoins via the auto-join path', async ({ browser }) => {
    const page = await newUserPage(browser);
    const roomId = await createRoom(page, 'Alice');
    await page.getByRole('button', { name: /Leave/i }).click();
    await page.waitForURL('**/');

    await page.getByRole('link', { name: new RegExp(roomId) }).click();
    await page.waitForURL(new RegExp(`/room/${roomId}$`));
    await expect(playerRow(page, 'Alice')).toBeVisible();
  });

  test('Forget removes the room from the list and persists across reload', async ({ browser }) => {
    const page = await newUserPage(browser);
    const roomId = await createRoom(page, 'Alice');
    await page.getByRole('button', { name: /Leave/i }).click();
    await page.waitForURL('**/');

    await page.locator('.room-row', { hasText: roomId })
      .getByRole('button', { name: /Forget this room/i }).click();
    await expect(page.locator('.room-row', { hasText: roomId })).toHaveCount(0);

    await page.reload();
    await expect(page.locator('.room-row', { hasText: roomId })).toHaveCount(0);
  });

  test('joining a room via URL also adds it to the list', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');

    const ctxB = await browser.newContext();
    const bob = await ctxB.newPage();
    await joinRoomByUrl(bob, roomId, 'Bob');
    await bob.getByRole('button', { name: /Leave/i }).click();
    await bob.waitForURL('**/');

    await expect(bob.locator('.room-row', { hasText: roomId })).toBeVisible();
  });
});

// ============================================================
// 17. Rename in room
// ============================================================

test.describe('Rename in room', () => {
  test('clicking the You chip opens the rename dialog and renames everywhere', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    await alice.locator('.you-chip').click();
    const dialog = alice.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Your Name').fill('Allie');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    await expect(playerRow(alice, 'Allie')).toBeVisible();
    await expect(playerRow(bob, 'Allie')).toBeVisible();
    await expect(playerRow(alice, 'Alice')).toHaveCount(0);
  });

  test('renaming to a duplicate is blocked with inline error', async ({ browser }) => {
    const alice = await newUserPage(browser);
    const bob = await newUserPage(browser);
    const roomId = await createRoom(alice, 'Alice');
    await joinRoomByUrl(bob, roomId, 'Bob');

    await alice.locator('.you-chip').click();
    const dialog = alice.getByRole('dialog');
    await dialog.getByLabel('Your Name').fill('Bob');
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
    await expect(dialog).toContainText(/already taken/i);
  });

  test('rename preserves vote and host badge', async ({ browser }) => {
    const alice = await newUserPage(browser);
    await createRoom(alice, 'Alice');
    await selectCard(alice, '5');

    await alice.locator('.you-chip').click();
    const dialog = alice.getByRole('dialog');
    await dialog.getByLabel('Your Name').fill('Allie');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    await expect(alice.locator('.voted-count')).toHaveText('1 / 1 voted');
    await expect(playerRow(alice, 'Allie').locator('.host-badge')).toBeVisible();
  });

  test('rename updates localStorage so future rooms use the new name', async ({ browser }) => {
    const alice = await newUserPage(browser);
    await createRoom(alice, 'Alice');
    await alice.locator('.you-chip').click();
    const dialog = alice.getByRole('dialog');
    await dialog.getByLabel('Your Name').fill('Allie');
    await dialog.getByRole('button', { name: 'Save' }).click();

    const stored = await alice.evaluate(() => localStorage.getItem('planning-poker-name'));
    expect(stored).toBe('Allie');
  });

  test('Save is disabled when the name is unchanged', async ({ browser }) => {
    const alice = await newUserPage(browser);
    await createRoom(alice, 'Alice');
    await alice.locator('.you-chip').click();
    const dialog = alice.getByRole('dialog');
    await expect(dialog.getByLabel('Your Name')).toHaveValue('Alice');
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
