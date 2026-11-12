# Ігротека — family games on your own server

Ukrainian, playful browser games for up to four family members, installed on Android as a PWA when that milestone is complete. The game hub lives here; the first game is **Їжачі баталії** (Hedge Wars).

This repository currently provides a runnable hub, a Phaser workshop preview, a typed WebSocket handshake and a development/documentation foundation. It is not yet a playable artillery game. Multiplayer rooms, physics and terrain destruction are planned. A production PWA shell is implemented; actual Android installation over the final HTTPS domain still needs device verification, and offline multiplayer is not available.

## Layout and ownership

```text
07_games_web_app/                  # Git root; supplied GitHub remote
  hub/                            # welcome page / game chooser
  platform/games.ts               # shared game catalogue
  docs/                           # platform status, UI rules, decisions, runbook
  scripts/                        # development orchestration and document checks
  tests/                          # cross-platform and network integration checks
  01_hedge_wars/
    client/                       # Phaser browser client, /games/hedge-wars/
    server/                       # HTTP/WSS foundation; authoritative game host to follow
    packages/protocol/            # validated client/server contract
    packages/simulation/          # reserved for pure game logic; see its README
    docs/                         # technical spec, checklist, acceptance, handoff, logs
```

Remote: <https://github.com/carrot-puff-agent/hedge_wars_web_app>. The parent is intentionally the repository root so a fresh clone includes the landing page and future games. All Hedge Wars implementation stays under `01_hedge_wars`. See ADR 0001.

## Run locally

Use Node 22.12+ (Node 22 is selected in `.nvmrc`) and npm. The current VM's Node 20.19.2 is also accepted by the pinned tools; CI uses Node 22. No database, Cloudflare account or native Android SDK is needed locally.

```sh
cd /home/coder/_PROJECTS/07_games_web_app
npm ci
npm run dev
```

Open <http://localhost:5173>. The launcher runs the hub on 5173, the game development server on 5174, and the backend on 8787. Both frontends proxy API/WebSocket traffic; the hub proxies the game route. Use loopback by default. For phone access, follow `docs/OPERATIONS.md`.

Production-shaped local verification:

```sh
npm run check
npm start
# http://127.0.0.1:8787/ and /games/hedge-wars/
```

`npm run check` runs TypeScript checks, unit/network tests, document checks and production builds. `npm run test:e2e` starts an isolated production server and checks desktop/mobile browser navigation and WebSocket behavior. `npm run test:dev` runs the same browser checks through the development proxies/HMR route. Neither validates real Android hardware.

## Read next

- [Current state](docs/STATUS.md) — what has actually been verified.
- [Platform specification](docs/PLATFORM_SPEC.md) and [Ukrainian UI rules](docs/UI_GUIDELINES.md).
- [Game technical specification](01_hedge_wars/docs/TECH_SPEC.md).
- [Ordered implementation checklist](01_hedge_wars/docs/CHECKLIST.md).
- [Acceptance criteria](01_hedge_wars/docs/ACCEPTANCE.md).
- [Agent instructions](AGENTS.md), [game instructions](01_hedge_wars/AGENTS.md), [handoff](01_hedge_wars/docs/HANDOFF.md).
- [Operations](docs/OPERATIONS.md), [reuse plan](01_hedge_wars/docs/REUSE_PLAN.md) and [asset register](01_hedge_wars/docs/ASSET_REGISTER.md).

No production domain, tunnel or VM service has been provisioned by this foundation. No Hedgewars code or art has been copied into the app. License selection and the first upstream imports have an explicit checklist gate.

