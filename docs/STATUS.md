# Platform status

Updated: 2026-11-12. Session: `2026-11-12-foundation`.

## Scope and state

- Repository root is `/home/coder/_PROJECTS/07_games_web_app`; first game lives in `01_hedge_wars`.
- Local foundation complete: Ukrainian hub, Phaser workshop preview, versioned hello/API origin, build/test scripts and project documentation.
- No playable match, multiplayer rooms, physics, terrain destruction, service-worker caching or verified PWA installation yet.
- No live service/tunnel/domain provisioned. No upstream Hedgewars code/art imported.
- Git remote configured for the supplied GitHub repository; foundation committed locally (`33ac73b`, with a follow-up documentation commit). GitHub push is blocked: no HTTPS Git credentials; `gh` API authentication also returned HTTP 401. Remote synchronization and hosted CI are not claimed.

Verification: clean `npm ci`; `npm run check` passed (strict types, two unit/network tests, documentation integrity and all three builds); `npm run test:e2e` passed four desktop/mobile-emulation tests; `npm run test:dev` passed the same four checks through development proxies. Desktop/mobile screenshots were visually reviewed. No actual Android hardware tested. All temporary listeners on 5173/5174/8787/8790 were confirmed closed after verification.

Canonical game task/evidence state: [checklist](../01_hedge_wars/docs/CHECKLIST.md), [handoff](../01_hedge_wars/docs/HANDOFF.md) and [foundation session](../01_hedge_wars/docs/sessions/2026-11-12-foundation.md).

Next milestone after verified foundation: SIM-01, pure serializable simulation state and explicit units/timestep decision. Deployment credentials do not block local simulation work.

