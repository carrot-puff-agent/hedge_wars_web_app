import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

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
  getCameraZoom: () => number;
  getActiveCharacterScreenPoint: () => { x: number; y: number } | null;
}

test('NET-07, UI-01..UI-05, GAME-01..GAME-03: 4 browser clients play room list -> match -> pass turn -> Angry Birds slingshot crater convergence -> results -> rematch', async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 1024, height: 640 } }),
    browser.newContext({ viewport: { width: 1024, height: 640 } }),
    browser.newContext({ viewport: { width: 1024, height: 640 } }),
    browser.newContext({ viewport: { width: 1024, height: 640 } }),
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
      await expect(page.locator('#connection')).toHaveText(/^(Онлайн|\d+\s*мс)$/);
    }

    const [p1, p2, p3, p4] = pages as [
      (typeof pages)[0],
      (typeof pages)[0],
      (typeof pages)[0],
      (typeof pages)[0],
    ];

    // Verify 10 distinct team color options are rendered
    await expect(p1.locator('.color-dot')).toHaveCount(10);

    // Host (p1) enters name on first launch, picks color, and creates room (stored in localStorage)
    await p1.locator('#team-name-input').fill('Команда А');
    await p1.locator('.color-dot[data-color="4"]').click();
    const cachedPrefs = await p1.evaluate(() => ({
      name: localStorage.getItem('yizhaklub.hedgeWars.playerName'),
      color: localStorage.getItem('yizhaklub.hedgeWars.playerColor'),
    }));
    expect(cachedPrefs.name).toBe('Команда А');
    expect(cachedPrefs.color).toBe('4');

    await p1.locator('#btn-create-room').click();
    await expect(p1.locator('#lobby-panel')).toBeVisible();
    await expect(p1.locator('#lobby-host-name')).toHaveText('Команда А');

    // Players 2, 3, 4 join the room directly from the live Available Rooms list (no room codes!)
    for (const [idx, page] of [p2, p3, p4].entries()) {
      await page.locator('#team-name-input').fill(`Команда ${idx + 2}`);
      const roomCard = page.locator('.room-join-card', { hasText: 'Команда А' });
      await expect(roomCard).toBeVisible();
      await roomCard.click();
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

    // Verify full-viewport canvas, Jump Left / Move Left / Jump Right / Move Right / Pass Turn / Crate buttons (>= 48x48 CSS px) and zero scrolling (UI-A01)
    const layoutMetrics = await p1.evaluate(() => {
      const visibleControls = Array.from(
        document.querySelectorAll<HTMLElement>(
          '#match-controls .touch-btn, #match-hud .timer-circle, #match-hud .crate-btn, #match-hud .square-icon-btn',
        ),
      );
      const minHeight = Math.min(...visibleControls.map((b) => b.getBoundingClientRect().height));
      const minWidth = Math.min(...visibleControls.map((b) => b.getBoundingClientRect().width));
      const canvasRect = document.querySelector('canvas')!.getBoundingClientRect();
      return {
        controlCount: visibleControls.length,
        minHeight,
        minWidth,
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
        noVerticalOverflow: document.documentElement.scrollHeight <= window.innerHeight,
        fullViewportCanvas:
          Math.abs(canvasRect.width - window.innerWidth) <= 1 &&
          Math.abs(canvasRect.height - window.innerHeight) <= 1,
      };
    });
    expect(layoutMetrics.controlCount).toBe(7);
    expect(layoutMetrics.minHeight).toBeGreaterThanOrEqual(48);
    expect(layoutMetrics.minWidth).toBeGreaterThanOrEqual(48);
    expect(layoutMetrics.noHorizontalOverflow).toBe(true);
    expect(layoutMetrics.noVerticalOverflow).toBe(true);
    expect(layoutMetrics.fullViewportCanvas).toBe(true);

    // Save gameplay visual snapshot for comparison with gameplay ui sample.jpg
    await mkdir('.local/screenshots', { recursive: true });
    await p1.screenshot({ path: '.local/screenshots/gameplay-tablet.png' });

    // Open and close weapon crate drawer
    await p1.locator('#btn-weapon-crate').click();
    await expect(p1.locator('#weapon-drawer')).toBeVisible();
    await p1.locator('#btn-weapon-rocket').click();
    await expect(p1.locator('#weapon-drawer')).toBeHidden();

    // Active player (p1, team-1) presses the circular timer with arrows to pass turn to team-2 (p2)
    await p1.locator('#btn-pass-turn').click();
    await expect
      .poll(
        () =>
          p2.evaluate(
            () =>
              (window as unknown as { __hedgeDebug: HedgeDebug }).__hedgeDebug.getActiveTeamId(),
          ),
        { timeout: 6000 },
      )
      .toBe('team-2');

    // Active player (p2, team-2) aims and fires in Angry Birds style:
    // touch active character, pull back (down-right so shot flies up-left), and release finger to fire
    const charScreenPt = await p2.evaluate(() =>
      (window as unknown as { __hedgeDebug: HedgeDebug }).__hedgeDebug.getActiveCharacterScreenPoint(),
    );
    expect(charScreenPt).not.toBeNull();
    await p2.mouse.move(charScreenPt!.x, charScreenPt!.y);
    await p2.mouse.down();
    await p2.mouse.move(charScreenPt!.x + 65, charScreenPt!.y + 22, { steps: 5 });
    await p2.mouse.up();

    // Wait until turn resolves, crater settles, and activeTeamId advances to team-3
    await expect
      .poll(
        () =>
          p2.evaluate(
            () =>
              (window as unknown as { __hedgeDebug: HedgeDebug }).__hedgeDebug.getActiveTeamId(),
          ),
        { timeout: 10000 },
      )
      .toBe('team-3');

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
              s.activeTeamId === 'team-3' &&
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

    // Host triggers rematch and Player 2 rejoins from the Available Rooms list (GAME-03)
    await p1.locator('#btn-rematch').click();
    await expect(p1.locator('#lobby-panel')).toBeVisible();
    const roomCard = p2.locator('.room-join-card', { hasText: 'Команда А' });
    await expect(roomCard).toBeVisible();
    await roomCard.click();
    await expect(p2.locator('#lobby-panel')).toBeVisible();
    await p2.locator('#btn-ready').click();
    await expect(p1.locator('#btn-start-match')).toBeEnabled();

    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((ctx) => ctx.close()));
  }
});
