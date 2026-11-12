# 2026-11-12 — rename app to «Наші ігри»

- Scope: rename the web app in the hub, game header, document titles and PWA manifest, preserving its manifest ID, routes, controller icon and Cloudflare Access setup.
- Task: HUB-02. Existing installed PWA identity remains `/`; Android may apply the display-name update asynchronously.
- Local verification: `npm run check` passed; `npm run test:e2e` passed 10 desktop/mobile-emulated browser checks, including credentialed manifest access, viewport fit and offline shell.
- Deployment: updated and built the existing LXC `/home/dev/games-web-app`; `yizhaklub.service` remained active. Live hub and game HTML, built JavaScript and manifest verified the exact new name and credentialed manifest links. Manifest ID remains `/` and health is OK; no Cloudflare configuration change was required.
- Rollback archive: `/home/dev/games-backups/pre-app-rename-yI9hik.tar.gz` on the LXC.
- Actual Android launcher display-name refresh remains to be observed. The browser/system controls when it updates an already installed PWA.
