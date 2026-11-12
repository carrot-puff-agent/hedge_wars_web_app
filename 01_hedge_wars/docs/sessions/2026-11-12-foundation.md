# 2026-11-12 — project foundation

- Session: `2026-11-12-foundation`, bootstrap coding agent.
- Starting state: empty `07_games_web_app/01_hedge_wars`; no parent Git repository; supplied remote had no refs.
- Tasks: FND-01–FND-07; acceptance FND-A01–FND-A07.
- Scope: establish environment, durable plan and handoff, plus runnable Ukrainian hub/game workshop; no artillery or online-match implementation.

## Changes

Created one root Git/npm workspace with the supplied remote; retained game ownership under `01_hedge_wars`. See ADR 0001. Added original Ukrainian hub, responsive warm/playful CSS, interactive Phaser workshop, original icons and manifest metadata. Service-worker caching/install validation remains a later gate.

Added strict typed hello/error protocol, Node HTTP/static/API host and real WebSocket transport with message validation, version/origin/payload checks. No rooms or gameplay capabilities are advertised. Added clean build/test scripts, CI and browser smoke checks for both production and development routes.

Created platform/game specifications, 44-task ordered checklist, acceptance matrix, root/game AGENTS, UI rules, operations runbook, reuse/asset registers and handoff/template. No Hedgewars/Warlings code or art copied. External reference checkout remains read-only.

## Verification

| Command / scenario | Observed result | Limits / evidence |
| --- | --- | --- |
| `npm ci` | PASS | clean reinstall; 42 packages audited, no reported vulnerabilities at setup |
| `npm run check` | PASS | strict TypeScript, two test cases covering contracts/real HTTP+WS, docs, hub/game/server production builds |
| `npm run test:e2e` | PASS, 4 tests | desktop Chromium + 360px Android emulation; game navigation, direct reload, hello, interaction, overflow, console, focus and reduced motion |
| `npm run test:dev` | PASS, 4 tests | same browser checks through actual dev launcher and HTTP/HMR/application WebSocket proxies; final run completed in about 5 seconds |
| Desktop/mobile visual review | PASS | `.local/screenshots/hub-desktop.png`, `hub-android.png`, `game-desktop.png`, `game-android.png`; ignored local artifacts |
| Port cleanup 5173/5174/8787/8790 | PASS | each refused a connection after final test teardown |
| `git diff --check` | PASS before commit | no whitespace errors |
| Real Android, installed PWA, four-device match, Cloudflare route | NOT RUN | intentionally open later gates |
| GitHub API access | FAIL | `gh repo view`: HTTP 401 Requires authentication; read-only Git access returned empty remote refs |

Two integration issues found and fixed: hub-to-game HMR needed a WebSocket-enabled proxy, otherwise the pending browser HMR handshake delayed the application's socket; Playwright needed graceful SIGTERM shutdown so the dev launcher could stop its owned child process groups. Final dev checks pass and leave no application listeners. Intermediate orphaned groups from the failed teardown were explicitly stopped.

Nonblocking observations: Vite reports the lazy Phaser preview chunk above its default size warning (about 1.20 MB / 320 KB gzip). Browser runs logged no page/console errors. Development proxy may log an ECONNRESET when a browser closes a socket; no failed assertion or retained listener resulted. No phone performance claim is made.

## Handoff

- FND-01–FND-06 complete with local evidence. GitHub synchronization is being finalized as FND-07; do not infer push success from read access or the existence of the local workspace.
- Git identity was absent. Bootstrap commits may use the explicit automated identity `Project bootstrap agent <bootstrap@local.invalid>` via per-command options, leaving global identity unchanged; this is not an invented user identity.
- Next unblocked engineering task: SIM-01. Start by reading HANDOFF and specs; add the pure simulation package, not more workshop features.
- Persistent services: none. Temporary app/test processes: stopped; ports verified closed.
