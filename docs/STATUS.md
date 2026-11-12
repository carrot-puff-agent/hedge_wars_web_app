# Platform status

Updated: 2026-11-12. Session: `2026-11-12-multiplayer-playable`.

## Scope and state

- Primary development Git checkout is `/home/dev/games-web-app` on the LXC. The original VM has a separate checkout at `/home/coder/_PROJECTS/07_games_web_app`; first game lives in `01_hedge_wars` in each.
- Local foundation complete: Ukrainian hub, Phaser match renderer, versioned gameplay protocol, build/test scripts and project documentation.
- Hub is named «Наші ігри»: a game-neutral, viewport-sized chooser with a Material controller PWA icon. The rename is deployed and the live LXC manifest and both pages were verified; see HUB-01 and HUB-02.
- Phase 1 pure simulation (`SIM-01`–`SIM-07`), Phase 2 multiplayer networking (`NET-01`–`NET-08`), Phase 3 playable client (`UI-01`–`UI-03`, `UI-05`, and remote interpolation/local aim feedback in `UI-04`), and Phase 4 game loop (`GAME-01`–`GAME-03`) are complete and verified in automated Node and 4-browser E2E suites.
- Dedicated LXC service is running and enabled on `192.168.1.70:9999`; the user configured the Cloudflare domain. Production PWA service worker and versioned static shell cache are implemented. Upstream Hedgewars GPL-2.0 physics/terrain ports (`PORT-01`–`PORT-04` in `01_hedge_wars/docs/REUSE_PLAN.md`) and curated audio clips (`UPSTREAM-01` in `01_hedge_wars/docs/ASSET_REGISTER.md`) are recorded with license text at `licenses/hedgewars-GPL-2.0.txt`.
- Samsung tablet installation succeeded per user confirmation after both manifest links gained `crossorigin="use-credentials"`. A browser regression test proved cookies were omitted before the fix and sent afterward. Standalone/deep-link/update behavior remains to be verified on Android.
- LXC Git remote uses SSH as `carrot-puff-agent`; key authentication, push and tracking of GitHub `main` have been verified. Hosted CI has not been checked. Do not overwrite the LXC checkout from the original VM without inspecting its Git state.

Verification: LXC `npm run check` passed (strict types, 13 unit/server/simulation/network tests, doc checks for 46 tasks, and all builds); `npm run test:e2e` passed all 12 desktop/mobile-emulation tests including 4-browser room/match/crater-convergence/rematch. Real-device touch/FPS testing (`UI-06`) and four-human-device playtesting (`GAME-04`) are ready for user verification.

Canonical game task/evidence state: [checklist](../01_hedge_wars/docs/CHECKLIST.md), [handoff](../01_hedge_wars/docs/HANDOFF.md) and [multiplayer playable session](../01_hedge_wars/docs/sessions/2026-11-12-multiplayer-playable.md).

Next milestone: Real-device Android testing (`UI-06`, `GAME-04`) and real-route reconnect/performance verification (`OPS-03`, `OPS-04`).

