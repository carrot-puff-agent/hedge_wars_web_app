# Current handoff — read before continuing

Updated: 2026-11-12. Latest session: `2026-11-12-multiplayer-playable`.

## Paths and starting commands

- Primary root/Git/npm workspace: `/home/dev/games-web-app` on the LXC. Original VM checkout: `/home/coder/_PROJECTS/07_games_web_app`.
- Game: `01_hedge_wars`; hub: `hub`; LXC remote: `git@github.com:carrot-puff-agent/hedge_wars_web_app.git`.
- Official Hedgewars reference clone: `/home/dev/hedgewars-upstream`, separate from the app Git repository. Inspected commit `54437aa1a9078f77b0103f1df0aa81f4edc1be05`; see `REUSE_PLAN.md` for source, paths and import rules.
- Read root and game AGENTS, then TECH_SPEC, CHECKLIST, ACCEPTANCE and latest session log.
- Run `git status --short --branch` before changing files. Use `npm ci`, `npm run dev`, `npm run check`, `npm run test:e2e` from the root.

## Current implementation

Local foundation, Phase 1 pure simulation (`@yizhaklub/hedge-simulation`, `SIM-01`–`SIM-07`), Phase 2 multiplayer networking (`NET-01`–`NET-08`), Phase 3 playable client (`UI-01`–`UI-03`, `UI-05`, and remote interpolation/local aim feedback in `UI-04`), and Phase 4 game loop (`GAME-01`–`GAME-03`) are implemented and verified by automated Node and multi-browser tests.

Players can open `/games/hedge-wars/`, create or join a private 2–4 player room via a 4-character room code, customize their Ukrainian team name/color/symbol (`●`, `▲`, `■`, `◆`), configure host settings (turn duration, hedgehogs per team, grenade ammo), ready up, and play an authoritative 60 Hz match on the curated `2048x1024` «Сонячна галявина» map (`meadow-boulders`) with impact rockets, timed bouncing grenades, incremental changed-region crater rendering, multitouch controls, gesture-gated sound effects (`UPSTREAM-01`), disconnect pause/reconnect (`resumeToken`), victory standings and rematch. Real Android device touch/FPS verification (`UI-06`) and four-human-device playtesting (`GAME-04`) are ready to be performed by the user.

## Decisions

Parent root is intentionally the Git root so hub and future games are versioned together; game implementation stays in its child. See ADR 0001. Phaser 3 + TypeScript client, Node + WebSocket server, pure shared simulation in `@yizhaklub/hedge-simulation` running at a fixed 60 Hz timestep (`1 wu = 1 mask cell`, `2048x1024` baseline). Authoritative outcomes belong on the server. All player-visible UI is Ukrainian, playful and child-friendly.

## Verification and blockers

- Clean `npm ci` / `npm ls` passed with `@yizhaklub/hedge-simulation` linked in the root workspace.
- `npm run check` passed: strict types, 13 contract/server/simulation/network tests (`tests/protocol.test.ts`, `tests/server.test.ts`, `tests/simulation.test.ts`, `tests/network.test.ts`), doc validation (46 unique tasks) and all production builds.
- `LD_LIBRARY_PATH=/home/dev/.cache/hedge-playwright-deps/root/usr/lib/x86_64-linux-gnu npm run test:e2e`: all 12 desktop and 360px Android-emulation browser tests passed (including 4-browser room -> match -> crater convergence -> results -> rematch in `tests/browser/multiplayer.spec.ts`).
- `npm run test:dev`: four tests passed through Vite proxies/HMR at foundation setup. Graceful teardown confirmed all four application/test ports closed.
- Visual review: original Ukrainian desktop/mobile hub and workshop; screenshots under ignored `.local/screenshots/`.
- Dedicated LXC `192.168.1.70:9999`: `yizhaklub.service` enabled and active, sources `/home/dev/games-web-app`. LXC clean install/check/build and HTTP/WSS checks passed. See `docs/OPERATIONS.md` at the repository root.
- Production PWA worker caches a versioned shell; Chrome installability/offline checks passed against the LXC using a temporary secure-origin override. The user confirmed Samsung installation over HTTPS; actual reboot, Android deep links/update behavior and playable multiplayer remain untested.
- User confirmed Samsung Chrome installation works after both manifest links gained `crossorigin="use-credentials"`. The earlier Access bypass suggestion is superseded. Standalone deep-link and update behavior remain to be tested on Android. See `docs/sessions/2026-11-12-manifest-credentials.md`.
- The hub is the neutral, full-viewport «Наші ігри» game chooser. The app icon is Google's Material `sports_esports` controller, filling 50% of its width; see `ASSET_REGISTER.md` and sessions `2026-11-12-hub-redesign.md` and `2026-11-12-app-rename.md`.
- Known build note: the lazy-loaded Phaser preview chunk is about 1.20 MB / 320 KB gzip; map/device performance is not yet measured. Do not hide the warning by claiming an optimization.
- SSH GitHub authentication as `carrot-puff-agent` and normal LXC pushes succeeded. The key is configured in the LXC user's SSH config; do not read or display the private key. LXC Git repository has a local bot identity and `main` tracks `origin/main`. See `docs/sessions/2026-11-12-lxc-github.md`.
- On 2026-11-12, `npm run check` passed (10 Node tests) and the production browser suite passed all 10 tests with user-local Chromium libraries (`LD_LIBRARY_PATH=/home/dev/.cache/hedge-playwright-deps/root/usr/lib/x86_64-linux-gnu npm run test:e2e`). Android emulation does not verify real-device controls.

## Next actions

Test the deployed playable build on the family Android phones (`UI-06`, `GAME-04`, `OPS-03`, `OPS-04`): verify multitouch movement + aim/fire, measure real-route RTT/FPS on the oldest family phone, and run a complete 2–4 device match through victory and rematch.

## Processes

`yizhaklub.service` is intentionally running on the dedicated LXC at port 9999 and enabled at boot. No persistent service was created on the original VM. An already-running development launcher occupied local ports 5173, 5174 and 8787 during the LXC session; it was not started or stopped by that session. The local development preview can otherwise be started with `npm run dev` from the root.

