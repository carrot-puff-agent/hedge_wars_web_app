import { expect, test } from '@playwright/test';

interface HedgeDebug {
  getRoomCode: () => string | null;
  getRoomStatus: () => string | null;
  getMatchId: () => string | null;
  getMyTeamId: () => string | null;
  getActiveTeamId: () => string | null;
  getTurnPhase: () => string | null;
  getTerrainRevision: () => number | null;
  getTerrainChecksum: () => number | null;
  getWorldChecksum: () => number | null;
  getDirtyChunkUpdates: () => number;
}

test('NET-07, UI-01..UI-05, GAME-01..GAME-03: 4 browser clients play room -> match -> crater convergence -> results -> rematch', async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));

  const errors: string[] = [];
  for (const page of pages) {
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
  }

  try {
    await Promise.all(pages.map((p) => p.goto('/games/hedge-wars/')));
    for (const page of pages) {
      await expect(page.locator('#connection')).toContainText('Майстерня відчинена');
    }

    const [p1, p2, p3, p4] = pages as [
      (typeof pages)[0],
      (typeof pages)[0],
      (typeof pages)[0],
      (typeof pages)[0],
    ];

    // Host (p1) creates room
    await p1.locator('#team-name-input').fill('Команда А');
    await p1.locator('#btn-create-room').click();
    await expect(p1.locator('#lobby-panel')).toBeVisible();
    const roomCode = (await p1.locator('#lobby-room-code').textContent())!.trim();
    expect(roomCode.length).toBeGreaterThanOrEqual(4);

    // Players 2, 3, 4 join the room
    for (const [idx, page] of [p2, p3, p4].entries()) {
      await page.locator('#team-name-input').fill(`Команда ${idx + 2}`);
      await page.locator('#room-code-input').fill(roomCode);
      await page.locator('#btn-join-room').click();
      await expect(page.locator('#lobby-panel')).toBeVisible();
    }

    // Host configures 1 hedgehog per team
    await p1.locator('#setting-hogs-count').selectOption('1');

    // All 4 players click Ready
    for (const page of pages) {
      await page.locator('#btn-ready').click();
    }
    await expect(p1.locator('#btn-start-match')).toBeEnabled();

    // Host starts match
    await p1.locator('#btn-start-match').click();
    for (const page of pages) {
      await expect(page.locator('#match-hud')).toBeVisible();
      await expect(page.locator('#match-controls')).toBeVisible();
    }

    // Verify touch target minimums (>= 48x48 CSS px) and zero horizontal overflow (UI-A01)
    const layoutMetrics = await p1.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll<HTMLElement>('.touch-btn'));
      const minHeight = Math.min(...buttons.map((b) => b.getBoundingClientRect().height));
      const minWidth = Math.min(...buttons.map((b) => b.getBoundingClientRect().width));
      return {
        minHeight,
        minWidth,
        noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
      };
    });
    expect(layoutMetrics.minHeight).toBeGreaterThanOrEqual(48);
    expect(layoutMetrics.minWidth).toBeGreaterThanOrEqual(48);
    expect(layoutMetrics.noOverflow).toBe(true);

    // Active player (p1, team-1) fires a rocket using the touch control button
    await p1.locator('#btn-fire').dispatchEvent('pointerdown', { pointerId: 1 });
    await p1.waitForTimeout(60);
    await p1.locator('#btn-fire').dispatchEvent('pointerup', { pointerId: 1 });

    // Wait until turn resolves, crater settles, and activeTeamId advances to team-2
    await expect
      .poll(
        () =>
          p1.evaluate(
            () =>
              (window as unknown as { __hedgeDebug: HedgeDebug }).__hedgeDebug.getActiveTeamId(),
          ),
        { timeout: 10000 },
      )
      .toBe('team-2');

    // Wait for all 4 browsers to process the settled state update
    await expect
      .poll(
        async () => {
          const states = await Promise.all(
            pages.map((p) =>
              p.evaluate(() => {
                const dbg = (window as unknown as { __hedgeDebug: HedgeDebug }).__hedgeDebug;
                return {
                  activeTeamId: dbg.getActiveTeamId(),
                  phase: dbg.getTurnPhase(),
                  rev: dbg.getTerrainRevision(),
                  tHash: dbg.getTerrainChecksum(),
                  wHash: dbg.getWorldChecksum(),
                  dirtyUpdates: dbg.getDirtyChunkUpdates(),
                };
              }),
            ),
          );
          const first = states[0]!;
          const allMatch = states.every(
            (s) =>
              s.activeTeamId === 'team-2' &&
              s.phase === 'control' &&
              s.rev !== null &&
              s.rev > 0 &&
              s.rev === first.rev &&
              s.tHash === first.tHash &&
              s.wHash === first.wHash &&
              s.dirtyUpdates > 0,
          );
          return allMatch;
        },
        { timeout: 6000 },
      )
      .toBe(true);

    // Players 3 and 4 leave during the match, leaving p1 and p2
    await p3.locator('#btn-match-leave').click();
    await p4.locator('#btn-match-leave').click();
    await expect(p3.locator('#entry-panel')).toBeVisible();
    await expect(p4.locator('#entry-panel')).toBeVisible();

    // Player 2 leaves, awarding victory to Player 1 (team-1)
    await p2.locator('#btn-match-leave').click();
    await expect(p1.locator('#results-panel')).toBeVisible();
    await expect(p1.locator('#results-headline')).toContainText('Перемагає команда');

    // Player 2 rejoins room and they trigger a rematch (GAME-03)
    await p2.locator('#room-code-input').fill(roomCode);
    await p2.locator('#btn-join-room').click();
    await p1.locator('#btn-rematch').click();
    await expect(p1.locator('#lobby-panel')).toBeVisible();
    await expect(p1.locator('#btn-start-match')).toBeEnabled();

    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((ctx) => ctx.close()));
  }
});
