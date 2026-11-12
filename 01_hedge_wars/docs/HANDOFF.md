# Current handoff — read before continuing

Updated: 2026-11-12. Current session: `2026-11-12-foundation`.

## Paths and starting commands

- Root/Git/npm workspace: `/home/coder/_PROJECTS/07_games_web_app`.
- Game: `01_hedge_wars`; hub: `hub`; remote: `https://github.com/carrot-puff-agent/hedge_wars_web_app`.
- Read root and game AGENTS, then TECH_SPEC, CHECKLIST, ACCEPTANCE and latest session log.
- Run `git status --short --branch` before changing files. Use `npm ci`, `npm run dev`, `npm run check`, `npm run test:e2e` from the root.

## Current implementation

Local foundation is complete and verified. Hub/game preview and a typed hello are present. This is not playable multiplayer. Do not replace the acceptance/checklist with claims based on the workshop animation.

Physics, terrain, weapon behavior, room/session lifecycle, reconnect and matches are unimplemented. A versioned PWA shell worker exists; match-aware updates and real Android installation remain unverified. The source checkout in the older project is reference-only and not a build dependency. No upstream material has been imported.

## Decisions

Parent root is intentionally the Git root so hub and future games are versioned together; game implementation stays in its child. See ADR 0001. Phaser 3 + TypeScript client, Node + WebSocket server, pure shared simulation planned. Authoritative outcomes belong on the server. All player-visible UI is Ukrainian, playful and child-friendly.

## Verification and blockers

- Clean `npm ci` passed; 42 packages audited with no reported vulnerabilities at setup.
- `npm run check` passed: strict types, two contract/server tests, doc validation (44 unique tasks) and all production builds.
- `npm run test:e2e`: four tests passed against production files, desktop and 360px Android emulation.
- `npm run test:dev`: four tests passed through Vite proxies/HMR. Graceful teardown confirmed all four application/test ports closed.
- Visual review: original Ukrainian desktop/mobile hub and workshop; screenshots under ignored `.local/screenshots/`.
- Dedicated LXC `192.168.1.70:9999`: `yizhaklub.service` enabled and active, sources `/home/dev/games-web-app`. LXC clean install/check/build and HTTP/WSS checks passed. See `docs/OPERATIONS.md` at the repository root.
- Production PWA worker caches a versioned shell; Chrome installability/offline checks passed against the LXC using a temporary secure-origin override. No actual HTTPS domain, Android hardware, installed PWA, actual reboot or playable multiplayer has been tested.
- User confirmed Samsung Chrome installation works after both manifest links gained `crossorigin="use-credentials"`. The earlier Access bypass suggestion is superseded. Standalone deep-link and update behavior remain to be tested on Android. See `docs/sessions/2026-11-12-manifest-credentials.md`.
- The hub was redesigned as the neutral, full-viewport Ігротека game chooser. The app icon is Google's Material `sports_esports` controller, filling 50% of its width; see `ASSET_REGISTER.md` and session `2026-11-12-hub-redesign.md`.
- Known build note: the lazy-loaded Phaser preview chunk is about 1.20 MB / 320 KB gzip; map/device performance is not yet measured. Do not hide the warning by claiming an optimization.
- Foundation committed locally as `33ac73b`, followed by a documentation commit recording this handoff. GitHub push is blocked: `GIT_TERMINAL_PROMPT=0 git push -u origin main` failed with `could not read Username for 'https://github.com': terminal prompts disabled`. `gh repo view` also returned HTTP 401; read-only Git access worked with an empty remote. Restore GitHub authentication through the user/administrator, then run a normal push. No tokens were inspected or changed.
- No user Git identity was configured. Bootstrap commits use the transparent automated author `Project bootstrap agent <bootstrap@local.invalid>` via per-command options. No global Git identity was changed.

## Next actions

Begin SIM-01: add the pure simulation workspace with serializable state, seeded RNG, units and an explicit timestep decision. Then implement mask terrain/collision work in dependency order. Resolve Git synchronization independently if it remains blocked. Review the fresh checklist instead of rebuilding the foundation.

## Processes

`yizhaklub.service` is intentionally running on the dedicated LXC at port 9999 and enabled at boot. No persistent service was created on the original VM. An already-running development launcher occupied local ports 5173, 5174 and 8787 during the LXC session; it was not started or stopped by that session. The local development preview can otherwise be started with `npm run dev` from the root.

