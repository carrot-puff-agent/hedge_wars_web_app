# Platform status

Updated: 2026-11-12. Session: `2026-11-12-foundation`.

## Scope and state

- Repository root is `/home/coder/_PROJECTS/07_games_web_app`; first game lives in `01_hedge_wars`.
- Local foundation complete: Ukrainian hub, Phaser workshop preview, versioned hello/API origin, build/test scripts and project documentation.
- No playable match, multiplayer rooms, physics, terrain destruction or real-Android PWA installation verification yet.
- Dedicated LXC service is running and enabled on `192.168.1.70:9999`; the user will configure the Cloudflare tunnel/domain. Production PWA service worker and versioned static shell cache are implemented. No upstream Hedgewars code/art imported.
- Samsung tablet reported installation failure after confirming Install. Both manifest links now use `crossorigin="use-credentials"` to support Cloudflare Access; a browser regression test proved cookies were omitted before the fix and sent afterward. Awaiting user confirmation on actual Android. Cloudflare Access bypass is not required by this change; see `01_hedge_wars/docs/sessions/2026-11-12-manifest-credentials.md`.
- Git remote configured for the supplied GitHub repository; foundation committed locally (`33ac73b`, with a follow-up documentation commit). GitHub push is blocked: no HTTPS Git credentials; `gh` API authentication also returned HTTP 401. Remote synchronization and hosted CI are not claimed.

Verification: LXC `npm ci` and `npm run check` passed; service is active and enabled, was restarted successfully, and HTTP routes plus a forwarded-host WebSocket hello work from the VM. Local `npm run test:e2e` passed six desktop/mobile-emulation tests including service-worker offline shell. Persistent Chromium on the LXC origin reported no installability errors with a temporary secure-origin override, and offline hub/game preview loaded. Actual HTTPS, boot reboot, Android installation and touch behavior remain untested. Earlier foundation checks also passed development proxy and visual review.

Canonical game task/evidence state: [checklist](../01_hedge_wars/docs/CHECKLIST.md), [handoff](../01_hedge_wars/docs/HANDOFF.md) and [foundation session](../01_hedge_wars/docs/sessions/2026-11-12-foundation.md).

Next milestone after verified foundation: SIM-01, pure serializable simulation state and explicit units/timestep decision. Deployment credentials do not block local simulation work.

