# Current handoff — read before continuing

Updated: 2026-11-12. Current session: `2026-11-12-foundation`.

## Paths and starting commands

- Root/Git/npm workspace: `/home/coder/_PROJECTS/07_games_web_app`.
- Game: `01_hedge_wars`; hub: `hub`; remote: `https://github.com/carrot-puff-agent/hedge_wars_web_app`.
- Read root and game AGENTS, then TECH_SPEC, CHECKLIST, ACCEPTANCE and latest session log.
- Run `git status --short --branch` before changing files. Use `npm ci`, `npm run dev`, `npm run check`, `npm run test:e2e` from the root.

## Current implementation

Local foundation is complete and verified. Hub/game preview and a typed hello are present. This is not playable multiplayer. Do not replace the acceptance/checklist with claims based on the workshop animation.

Physics, terrain, weapon behavior, room/session lifecycle, reconnect, matches and PWA worker are unimplemented. The source checkout in the older project is reference-only and not a build dependency. No upstream material has been imported.

## Decisions

Parent root is intentionally the Git root so hub and future games are versioned together; game implementation stays in its child. See ADR 0001. Phaser 3 + TypeScript client, Node + WebSocket server, pure shared simulation planned. Authoritative outcomes belong on the server. All player-visible UI is Ukrainian, playful and child-friendly.

## Verification and blockers

- Clean `npm ci` passed; 42 packages audited with no reported vulnerabilities at setup.
- `npm run check` passed: strict types, two contract/server tests, doc validation (44 unique tasks) and all production builds.
- `npm run test:e2e`: four tests passed against production files, desktop and 360px Android emulation.
- `npm run test:dev`: four tests passed through Vite proxies/HMR. Graceful teardown confirmed all four application/test ports closed.
- Visual review: original Ukrainian desktop/mobile hub and workshop; screenshots under ignored `.local/screenshots/`.
- No actual Android hardware, installed PWA, Cloudflare route or playable multiplayer has been tested.
- Known build note: the lazy-loaded Phaser preview chunk is about 1.20 MB / 320 KB gzip; map/device performance is not yet measured. Do not hide the warning by claiming an optimization.
- `gh repo view` returned HTTP 401. Read-only `git ls-remote` succeeded with an empty remote. Commit/push verification is the only foundation task still being finalized. No user Git identity was configured; an explicitly labelled automated local author may be used without changing global settings.

## Next actions

Begin SIM-01: add the pure simulation workspace with serializable state, seeded RNG, units and an explicit timestep decision. Then implement mask terrain/collision work in dependency order. Resolve Git synchronization independently if it remains blocked. Review the fresh checklist instead of rebuilding the foundation.

## Processes

No persistent service has been created. All temporary development/test listeners on 5173, 5174, 8787 and 8790 were confirmed closed after verification. The user can start the local preview with `npm run dev` from the root.

