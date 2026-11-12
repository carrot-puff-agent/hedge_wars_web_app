# Development and operations runbook

Repository root: `/home/dev/games-web-app` on the primary development LXC; `/home/coder/_PROJECTS/07_games_web_app` on the original VM. The user manages the domain and Cloudflare Tunnel. Current hello endpoint has no sessions/rooms; complete NET-08 before exposing gameplay publicly.

## Dedicated LXC deployment

- LXC: `192.168.1.70`, user `dev`, source/build at `/home/dev/games-web-app`.
- Origin: `http://192.168.1.70:9999`, listening on the LXC network interface. Route the user's Cloudflare Tunnel to this HTTP origin and preserve the public `Host` header for WebSocket origin validation.
- Unit: `/etc/systemd/system/yizhaklub.service`, copied from `deploy/yizhaklub.service`; enabled at boot, running as `dev`, `Restart=on-failure`.
- LXC uses Debian's Node 20.19.2 and npm 9.2.0. Source, dependencies and builds are installed there; Git credentials and `LXC_details.txt` are excluded from the mirror.
- Manage on the LXC: `sudo systemctl status yizhaklub`, `sudo systemctl restart yizhaklub`, `sudo systemctl stop yizhaklub`; logs: `journalctl -u yizhaklub -n 100 --no-pager`.
- Verification after restart: `systemctl is-enabled yizhaklub`, `systemctl is-active yizhaklub`, then request `/api/health`, `/`, `/games/hedge-wars/`, `/manifest.webmanifest`, `/sw.js` and test `/ws`.

The LXC is the primary Git checkout, not a passive mirror. Develop and push from `/home/dev/games-web-app`. Do not mirror an older VM checkout over LXC work. After approved changes, run `npm ci` if dependencies changed, `npm run check`, relevant browser checks, and `npm run build`; static output is served from the checkout. Restart `yizhaklub.service` when server code changes. Back up a known-good release before deploying changes; rollback has not yet been rehearsed. The LXC is a separate Debian host and uses systemd; the original VM's `agent-service` rules remain applicable to services on that VM.

HTTPS on the final Cloudflare hostname is required for Chrome's PWA features. The initial shell caches both routes and built assets; API/WebSocket traffic always requires the server. A new worker waits for existing controlled pages to close. Match-aware update prompts, real Android installation and HTTPS tunnel testing remain open.

## Local environment

Use Node 22.12+ / npm and the root lockfile. This VM currently also supports the pinned tools with Node 20.19.2. Node 22 is the CI baseline. System packages use `sudo agent-apt`, not direct apt. Do not inspect `.secrets`.

```sh
cd /home/coder/_PROJECTS/07_games_web_app
npm ci
npm run dev
```

| Port | Process | Role |
| --- | --- | --- |
| 5173 | hub Vite | main development entry; proxies game/API/WS |
| 5174 | game Vite | first game's development assets |
| 8787 | backend | HTTP/API/WebSocket origin |
| 8790 | browser test origin | isolated temporary production-shaped server |

The dev launcher owns its child process groups; Ctrl+C stops them. Ports are strict; if occupied, identify the process rather than killing unknown processes. Local logs can be redirected into ignored `.local/logs/`. Terminal logs are technical English/JSON; UI messages are Ukrainian.

## Verification

```sh
npm run check
npm run test:e2e
npm run test:dev
git diff --check
```

`check` runs typecheck, contract/server tests, document integrity and builds. `test:e2e` runs against built files and a real WebSocket origin, not mocked responses. `test:dev` checks the development launcher and both HTTP/WebSocket proxies, including the game Vite HMR upgrade path. Local Playwright automatically uses `/usr/bin/chromium` if available; otherwise install its Chromium with `npx playwright install chromium`. Override the executable with `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when needed. CI installs its own browser/dependencies.

Ignored traces appear in `test-results/` on failure. Review the trace and fix the cause; do not loosen assertions to claim success. Actual Android install/multitouch/lifecycle tests have separate manual acceptance gates.

## Production-shaped local server

```sh
npm run build
npm start
```

Default `HOST=127.0.0.1`, `PORT=8787`. Environment files are not loaded implicitly; use the deployment service environment or explicitly export development values. `.env.example` documents settings, not credentials. Both apps, shared icons, manifest, API and WebSocket are served by this process.

For actual phone testing, first complete relevant exposure/access checks. Use an approved HTTPS tunnel/domain or bind a controlled LAN test origin explicitly (`HOST=0.0.0.0`). A LAN HTTP URL can test basic controls but does not satisfy secure-context/PWA acceptance. Do not expose the Vite development servers as the production application.

Clients use same-origin API/WSS URLs. If a different browser origin is deliberately needed, add only the exact approved origin(s) to comma-separated `ALLOWED_ORIGINS`. Missing Origin is accepted for non-browser protocol/test clients; room authentication remains a separate NET-08 responsibility.

## Later persistent VM deployment

Read the VM memo again before installation. Create an executable launcher under `~/.config/agent-services/yizhaklub`, with a known Node executable, working directory, loopback host and selected port. Then manage it with:

```sh
sudo agent-service project start yizhaklub
sudo agent-service project status yizhaklub
sudo agent-service project logs yizhaklub
sudo agent-service project stop yizhaklub
```

Do not create/enable that service until the deployment task is authorized and ready. All managed services receive the VM's environment; never print it or read its secret store. Ask the administrator to supply missing production credentials through the established mechanism.

Cloudflare Tunnel can map the chosen domain to `http://127.0.0.1:8787`. Regular proxied HTTPS/WSS is sufficient. Exact hostname, tunnel ownership and access policy are intentionally unresolved because the user has not supplied them. Do not create DNS records or tunnel credentials speculatively. Match computation and room state remain on this server.

## Release and rollback procedure

1. Record commit/build/protocol/rules/content versions and run all applicable acceptance gates.
2. Keep the previous verified build/commit and configuration reference. Never store credentials in release notes.
3. Schedule updates between matches; the later PWA worker must not activate an incompatible client mid-match.
4. Build/install dependencies, restart only the named application service, verify root/game/API/WSS and one client reconnect.
5. If verification fails, restore the previous application release and restart that service. The first release may terminate active matches on server restart; communicate this honestly.

## GitHub synchronization

The LXC checkout uses `git@github.com:carrot-puff-agent/hedge_wars_web_app.git`. SSH is configured for the `carrot-puff-agent` account using the dedicated key at `~/.ssh/codex_github_ed25519` and the verified GitHub host key. Git has a repository-local bot identity; global identity is unchanged. Never print/read private key contents or put them in the repository, backups or logs.

From `/home/dev/games-web-app`, inspect `git status --short --branch`, then use normal `git pull --ff-only` and `git push` as appropriate. `ssh -T git@github.com` prints a successful authentication message but intentionally exits 1 because GitHub does not offer a shell. Do not force-push, change remote visibility, or overwrite uncommitted work. If authentication fails, record the redacted error and ask the administrator to repair access; do not inspect token stores.

