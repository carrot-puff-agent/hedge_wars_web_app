# Platform specification

Status: accepted foundation direction, 2026-11-12. Scope: the hub and cross-game infrastructure. Game behavior belongs in `01_hedge_wars/docs/TECH_SPEC.md`.

## Product

One private family game destination on the user's domain. The root page lets people choose a game, open its page and return to the hub. Android Chrome/PWA is the primary eventual client; desktop browsers are useful for development and play. Every user-facing surface is Ukrainian. The provisional platform name is Їжаклуб; the first game is Їжачі баталії. Names are configurable presentation choices, not architectural identifiers.

First game: 2–4 separate players/devices, turn-based artillery, destructible terrain and a server run by the user. Later games get independent folders and routes; they should not require a rewrite of the hub or an external account system.

## Routes and ownership

| Route | Owner | Foundation behavior |
| --- | --- | --- |
| `/` | hub | Ukrainian game selector |
| `/games/hedge-wars/` | Hedge Wars client | interactive workshop preview |
| `/api/health` | server host | JSON availability/version information |
| `/api/games` | catalogue | registered public game metadata |
| `/ws` | Hedge Wars network entry | versioned hello/error only |
| `/manifest.webmanifest` | hub | platform metadata; installation gate is later |

Register each game in `platform/games.ts`. Maintain a stable ASCII `id`, Ukrainian title, route, lifecycle status and local client build path. Only implemented routes appear as launchable cards. Future games may have a clearly non-actionable teaser; never link a fake game.

Foundation has one backend process. The current entry lives in the first game's server to avoid prematurely creating a generic server framework. Before a second game needs backend state, extract HTTP/static routing and game dispatch into a platform server (checklist MG-01). Preserve the existing public routes. Never route a second game's messages into Hedge Wars room logic.

## Technology

- TypeScript in strict mode; npm workspaces with one lockfile.
- Vite for separate hub and game builds. Lightweight semantic DOM/CSS for the hub; Phaser 3.90 for the first game's rendering/input.
- Node.js HTTP and `ws` WebSockets for the origin service; Zod for validated contracts.
- Phaser is presentation only; authoritative simulation must run without it.
- One origin for HTML, assets, API and WSS in production. Use development proxies instead of hard-coded localhost URLs in clients.
- Tests: Node test runner with tsx for contracts and backend integration; Playwright for browser integration.
- CI: clean installation, checks, production build and Chromium smoke suite on Node 22.

Phaser 3 is deliberately pinned rather than adopting a major-version migration while bootstrapping. Dependency versions are locked. Review supported Node and browser baselines before deployment; do not infer support solely from a successful local build.

## Hosting and PWA

User-controlled local server/VM -> HTTPS/WSS ingress -> domain -> client-rendered game. Cloudflare Tunnel is a suitable ingress option, with no Cloudflare-specific match-state APIs. Domain/credentials are not supplied; no live publishing is assumed.

Installable PWA is a planned platform milestone: manifest, proper icons, service worker, versioned caches, update UX between matches and actual Android installation evidence. Foundation includes metadata/icons but deliberately no caching service worker. Never serve a stale client against an incompatible server. Cached UI does not imply offline multiplayer.

Reconnect support is mandatory for the playable release because browser suspension, phone lock and proxy reconnects can interrupt a socket. Use heartbeat, bounded retries and full state restoration. Do not promise an always-running background web app.

## Nonfunctional targets and release evidence

- Responsive layout from 360 CSS pixels wide, portrait hub and landscape play layout. No horizontal overflow. Touch targets at least 48x48 CSS pixels; visible keyboard focus; adequate contrast; reduced-motion mode.
- All runtime resources bundled/served by the origin; no mandatory third-party fonts, analytics, ads or gameplay services.
- Desired game rendering: 60 FPS, with a measured floor of 30 FPS on the agreed oldest family device at the selected map size. Device/model and measurements must be recorded before calling this passed.
- Test the actual HTTPS/WSS route in addition to localhost; log latency before fixing network cadence thresholds.
- Private room entry, unguessable session credentials, input ownership validation and safe logs before exposure outside local development. The foundation hello endpoint grants no room or gameplay privileges.
- Maintain compatibility IDs for application protocol, simulation rules and selected content. A checksum detects disagreement; server snapshots repair it.

Sources: [Phaser](https://docs.phaser.io/), [Vite](https://vite.dev/guide/), [Cloudflare WebSockets](https://developers.cloudflare.com/network/websockets/), [browser lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api).

