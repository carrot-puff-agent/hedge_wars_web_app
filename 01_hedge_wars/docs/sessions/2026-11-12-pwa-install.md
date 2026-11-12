# 2026-11-12 — Samsung PWA installation investigation

**Superseded:** the user identified authenticated manifest fetching as the relevant fix. The missing `crossorigin="use-credentials"` was reproduced and corrected; do not make the suggested Access bypass changes. See `2026-11-12-manifest-credentials.md`.

- Scope: investigate the user's report that Chrome on a Samsung tablet says the app cannot be installed after the user confirms installation.
- Public URL: `https://gamehub-home.firsoff.co.ua/`.
- No application code, server service or Cloudflare configuration changed during this investigation.

## Observations

- LXC origin `192.168.1.70:9999` serves `/`, `/manifest.webmanifest`, `/sw.js`, `/icons/icon-192.png` and `/icons/icon-512.png` with HTTP 200 and appropriate content types.
- Without a Cloudflare Access session, the public domain returns HTTP 302 to Cloudflare Access login for `/`, the manifest, both icons and the worker. Redirect parameters and credentials were not retained in project documentation.
- User reports the failure occurs after confirming Install, rather than before the dialog.
- Earlier persistent desktop Chromium tests passed manifest/installability checks with an insecure-origin override. That does not prove Android WebAPK packaging succeeds through the real HTTPS route.

## Working hypothesis and next step

Chrome's Android installation uses a WebAPK packaging service; inaccessible manifest or icon URLs may interfere with it. The Access redirects are a concrete configuration issue and a plausible cause, not proof of the tablet failure. The user controls Cloudflare configuration. As a narrow diagnostic, configure more-specific Access applications for `/manifest.webmanifest` and `/icons/*` with a Bypass policy, keeping the root application, `/api` and `/ws` protected. Verify anonymous HTTP 200 and expected content types for only those assets, confirm `/` still redirects to Access login, and repeat the actual tablet install. The static manifest and art would be public. Do not change Cloudflare policies without the user's instruction.

If the same failure persists, restore the original policy if desired and obtain device Chrome version, Android version and remote debugging/logcat evidence for the WebAPK install error; do not present this hypothesis as resolved.

References: [Chromium WebAPK architecture](https://chromium.googlesource.com/chromium/src/+/main/components/webapps/docs/android_architecture.md), [Cloudflare path precedence](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/), [Cloudflare Bypass policy](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/).

## Checks and state

- Local and origin inspection: completed; no code modifications or tests required.
- Cloudflare policy and Android installation test: pending user action / access; no configuration modified.
- The LXC service remains running; existing local development processes were not altered.
