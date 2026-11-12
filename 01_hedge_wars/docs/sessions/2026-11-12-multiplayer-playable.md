# Session — 2026-11-12 — Phases 2–4 Multiplayer Server, Playable Client & Game Loop

## Goal

Complete Phase 2 (`NET-01`–`NET-08`), Phase 3 (`UI-01`–`UI-05`), and Phase 4 (`GAME-01`–`GAME-03`) so that **Їжачі баталії** is a playable 2–4 player networked game ready for real Android device and family testing (`UI-06`, `GAME-04`).

## Scope & Tasks Completed

- `NET-01`: Extended and versioned `@yizhaklub/hedge-protocol` (`PROTOCOL_VERSION = 2`, `RULES_VERSION = 1`, `CONTENT_HASH = 'meadow-boulders-v1-2048x1024'`) with strict Zod schemas for sessions, private rooms, team/host settings, owned gameplay commands, acknowledgements, snapshots, tick deltas, terrain crater revisions, and Ukrainian error mappings (`ERROR_MESSAGES_UK`).
- `NET-02`: Implemented `RoomManager` in `01_hedge_wars/server/src/rooms.ts` supporting private 4-character room codes, 2–4 player capacity (`ROOM_FULL` on 5th player), room isolation, team customization (sanitised Ukrainian names, color/symbol presets, hog names), ready state, match start, voluntary leave, and deterministic host reassignment.
- `NET-03` & `GAME-01`: Implemented authoritative 60 Hz match runner with turn lifecycle (`select -> control -> resolve -> settle -> finished`), strict active-team and monotonic `commandSeq` enforcement (`NOT_YOUR_TURN`, `STALE_COMMAND`, `INVALID_PHASE`, `OUT_OF_AMMO`), turn timer that never cuts off active projectile resolution, round-robin team/character rotation, elimination, and victory/draw resolution.
- `NET-04`: Implemented `client.ping`/`server.pong` RTT heartbeat, immediate release of held movement inputs on disconnect/blur/visibility-loss (`match.release_inputs`), 120s bounded reconnect grace period with secret server-issued `resumeToken`, shared family pause-on-disconnect (`disconnectPolicy: 'pause'`), and timeout forfeiture.
- `NET-05`: Implemented full RLE world/terrain snapshots (`match.snapshot`) on start and reconnect, plus automatic revision-gap and checksum-mismatch recovery via `match.request_snapshot`.
- `NET-06`: Enforced `protocolVersion`, `rulesVersion`, and `contentHash` compatibility on `client.hello` and before room match start, displaying Ukrainian reload guidance (`requiresReload: true`).
- `NET-07`: Verified 2-client and 4-client convergence over both real WebSockets (`tests/network.test.ts`) and 4 concurrent Playwright browser instances (`tests/browser/multiplayer.spec.ts`), recording payload sizes (`~9.8 KB` full RLE snapshot, `< 1.8 KB` state delta) and server tick durations (`~0.12 ms/tick`).
- `NET-08`: Enforced per-session command rate limits, bounded rooms/sessions, name/code sanitisation, and verified structured logs never leak `resumeToken` credentials or raw player inputs.
- `GAME-02`: Added curated static map manifest `CURATED_MAP_MEADOW` (`meadow-boulders`, «Сонячна галявина», `2048x1024`, `waterLine = 940`) in `01_hedge_wars/packages/simulation/src/maps.ts` with 4×4 grounded spawn points, indestructible stone anchors, configurable turn durations, character counts, and rocket/grenade team inventories.
- `GAME-03`: Implemented match results summary (`match.results`), rematch flow (`room.rematch`), and room/hub navigation without leaked intervals or listeners.
- `UI-01`: Replaced workshop preview with `createMatchRenderer` (`01_hedge_wars/client/src/renderer.ts`), featuring full-screen edge-to-edge `Phaser.Scale.RESIZE` canvas (`100vw × 100dvh`), incremental changed-region terrain texture updates (`putImageData` on crater bounding boxes), sandy/grassy island palette, turquoise water with foam waves, helmeted characters with overhead health numbers, trajectory reticle, direct touch-drag aiming, and follow/drag-pan/overview camera modes.
- `UI-02`: Implemented strictly non-scrollable (`100dvh`, `overflow: hidden`) full-screen Android game UI in `01_hedge_wars/client/src/main.ts` and `01_hedge_wars/client/src/style.css` modeled directly on `01_hedge_wars/docs/gameplay ui sample.jpg`: translucent corner HUD (top-left circular countdown timer + square action buttons, top-right wooden weapon crate button + popover drawer, bottom-left and bottom-right stacked translucent white-ringed circular thumb controls) and compact centered modals for room creation, lobby, and match results.
- `UI-03`: Added `>= 48x48 CSS px` independent multitouch controls (`pointerdown`/`pointerup`/`pointercancel`/`lostpointercapture` keyed by `pointerId`) for simultaneous walking, jumping, aiming, and power charging, with safe-area insets and blur/visibility auto-release.
- `UI-04` (`[~]`): Added 60 FPS remote entity interpolation and immediate zero-RTT local aim/power-charge feedback; real Cloudflare route latency measurement remains open for device testing.
- `UI-05`: Bundled 5 curated upstream Hedgewars `.ogg` sound effects (`UPSTREAM-01` in `ASSET_REGISTER.md`) with Web Audio synth fallback in `01_hedge_wars/client/src/audio.ts`, gated behind user gesture with an accessible Ukrainian mute toggle (`🔊 Звук` / `🔇 Без звуку`), team symbol + color badges (`●`, `▲`, `■`, `◆`), and `prefers-reduced-motion` support.

## Verification

- `npm run check`: Passed (`tsc --noEmit`, 13/13 Node unit/integration tests across `tests/protocol.test.ts`, `tests/server.test.ts`, `tests/simulation.test.ts`, `tests/network.test.ts`, `check:docs` across 46 tasks, and all production builds).
- `LD_LIBRARY_PATH=/home/dev/.cache/hedge-playwright-deps/root/usr/lib/x86_64-linux-gnu npm run test:e2e`: Passed all 12 Playwright browser tests (6 desktop Chromium + 6 mobile 360px Android emulation, including the 4-browser room -> match -> crater convergence -> results -> rematch test).

## Next Steps

- Restart `yizhaklub.service` on LXC port `9999` so the live server serves the new playable build, and invite the user to test on their real Android devices (`UI-06`, `GAME-04`).
