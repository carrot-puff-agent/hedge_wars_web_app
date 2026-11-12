# Platform status

Updated: 2026-11-12. Session: `2026-11-12-phase1-simulation`.

## Scope and state

- Primary development Git checkout is `/home/dev/games-web-app` on the LXC. The original VM has a separate checkout at `/home/coder/_PROJECTS/07_games_web_app`; first game lives in `01_hedge_wars` in each.
- Local foundation complete: Ukrainian hub, Phaser workshop preview, versioned hello/API origin, build/test scripts and project documentation.
- Hub is named «Наші ігри»: a game-neutral, viewport-sized chooser with a Material controller PWA icon. The rename is deployed and the live LXC manifest and both pages were verified; see HUB-01 and HUB-02.
- Phase 1 pure simulation (`@yizhaklub/hedge-simulation`, `SIM-01`–`SIM-07`, gates `SIM-A01`–`SIM-A06`) is complete and verified: 60 Hz converted units, Mulberry32 seeded RNG, RLE world/terrain snapshots, 32×32 dirty chunk revision tracking, Bresenham crater carving, sub-pixel swept projectile collision, 6px slope walking/jumping/falling/drowning, impact rocket and timed bouncing grenade physics, radial explosion damage/knockback and deterministic replay repeatability.
- No multiplayer rooms or client match renderer wired yet (Phase 2 `NET-01`–`NET-08` and Phase 3 `UI-01`–`UI-06` are next).
- Dedicated LXC service is running and enabled on `192.168.1.70:9999`; the user configured the Cloudflare domain. Production PWA service worker and versioned static shell cache are implemented. Upstream Hedgewars GPL-2.0 physics/terrain ports are recorded in `01_hedge_wars/docs/REUSE_PLAN.md` (`PORT-01`–`PORT-04`) with license text at `licenses/hedgewars-GPL-2.0.txt`.
- Samsung tablet installation succeeded per user confirmation after both manifest links gained `crossorigin="use-credentials"`. A browser regression test proved cookies were omitted before the fix and sent afterward. Standalone/deep-link/update behavior remains to be verified on Android.
- LXC Git remote uses SSH as `carrot-puff-agent`; key authentication, push and tracking of GitHub `main` have been verified. Hosted CI has not been checked. Do not overwrite the LXC checkout from the original VM without inspecting its Git state.

Verification: LXC `npm run check` passed (strict types, 10 unit/server/simulation tests, doc checks for 46 tasks, and all builds); `npm run test:e2e` passed all 10 desktop/mobile-emulation tests. The user confirmed Android installation; standalone/deep-link/icon-refresh behavior, real-device touch testing and an actual LXC reboot remain unverified.

Canonical game task/evidence state: [checklist](../01_hedge_wars/docs/CHECKLIST.md), [handoff](../01_hedge_wars/docs/HANDOFF.md) and [Phase 1 session](../01_hedge_wars/docs/sessions/2026-11-12-phase1-simulation.md).

Next milestone: Phase 2 (`NET-01`), extending versioned protocol contracts for sessions, rooms, inputs, snapshots, events and terrain revisions (or `UI-01` match/terrain renderer, which is unblocked after `SIM-03`).

