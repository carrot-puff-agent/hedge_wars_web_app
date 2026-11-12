# Platform status

Updated: 2026-11-12. Session: `2026-11-12-foundation`.

## Scope and state

- Primary development Git checkout is `/home/dev/games-web-app` on the LXC. The original VM has a separate checkout at `/home/coder/_PROJECTS/07_games_web_app`; first game lives in `01_hedge_wars` in each.
- Local foundation complete: Ukrainian hub, Phaser workshop preview, versioned hello/API origin, build/test scripts and project documentation.
- Hub is named «Наші ігри»: a game-neutral, viewport-sized chooser with a Material controller PWA icon. The rename is deployed and the live LXC manifest and both pages were verified; see HUB-01 and HUB-02.
- No playable match, multiplayer rooms, physics or terrain destruction yet.
- Dedicated LXC service is running and enabled on `192.168.1.70:9999`; the user configured the Cloudflare domain. Production PWA service worker and versioned static shell cache are implemented. No upstream Hedgewars code/art imported.
- Samsung tablet installation succeeded per user confirmation after both manifest links gained `crossorigin="use-credentials"`. A browser regression test proved cookies were omitted before the fix and sent afterward. Standalone/deep-link/update behavior remains to be verified on Android.
- LXC Git remote uses SSH as `carrot-puff-agent`; key authentication, push and tracking of GitHub `main` have been verified. Hosted CI has not been checked. Do not overwrite the LXC checkout from the original VM without inspecting its Git state.

Verification: LXC `npm run check` passed after the hub redesign; service remains active and enabled, HTTP routes and a forwarded-host WebSocket hello work. Local `npm run test:e2e` passed ten desktop/mobile-emulation tests, including viewport fit and the service-worker offline shell. Persistent Chromium on the LXC origin reported no installability errors with a temporary secure-origin override. The user confirmed Android installation; standalone/deep-link/icon-refresh behavior, real-device touch testing and an actual LXC reboot remain unverified.

Canonical game task/evidence state: [checklist](../01_hedge_wars/docs/CHECKLIST.md), [handoff](../01_hedge_wars/docs/HANDOFF.md) and [foundation session](../01_hedge_wars/docs/sessions/2026-11-12-foundation.md).

Next milestone after verified foundation: SIM-01, pure serializable simulation state and explicit units/timestep decision. Deployment credentials do not block local simulation work.

