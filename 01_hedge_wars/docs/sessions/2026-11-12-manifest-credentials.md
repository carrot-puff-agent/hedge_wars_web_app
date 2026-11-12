# 2026-11-12 — authenticated manifest credentials

- Scope: fix the Samsung installation issue using the user's observation that authenticated manifests need `crossorigin="use-credentials"`.
- Task: PWA-02 remains in progress until actual Android installation and HTTPS deep links are verified.
- Changed `hub/index.html` and `01_hedge_wars/client/index.html`; both now request the manifest with credentials. Cloudflare Access remains unchanged.
- Added a browser integration test which requires a synthetic session cookie when Chromium requests the manifest from either page. The test failed on the previous build because the cookie was absent, and passed for both desktop Chromium and Android emulation after the fix. No real cookies or credentials are stored in the test.
- `npm run check` and `npm run test:e2e` passed: two protocol/server tests and eight desktop/mobile-emulated browser tests including the authenticated manifest, installation diagnostics, and offline shell.
- The previous recommendation to bypass Access for manifest/icons was premature and is superseded. It did not account for the missing credentials attribute. Actual Samsung WebAPK installation must still be tested by the user; do not claim success without their observation.
- Deployment target: `/home/dev/games-web-app` on the dedicated LXC, service `yizhaklub.service`, port 9999. Build updated on the LXC; app reads built files from disk. No Cloudflare policy changes are needed for this fix.
- Follow-up: open/reload the public HTTPS hub after logging in to Cloudflare Access, retry Chrome Install on the Samsung tablet, and record the result. If the old page/worker persists, close all app tabs and reopen; investigate real device logs if it still fails. Never require deleting Cloudflare protection as the first troubleshooting step.
