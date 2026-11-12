# 2026-11-12 — upstream review and first-game assessment

- Agent/session identifier: `2026-11-12-upstream-review`.
- Starting branch/commit: `main`, `0f70e23`; app working tree was clean.
- Scope: inspect the existing foundation and plan, clone official upstream for reference, and verify the current baseline. No gameplay implementation or imports were requested in this session; checklist statuses remain unchanged.
- Relevant next task/gate: SIM-01; imported code and assets also require the provenance and licensing work tracked by REL-01 and the reuse/asset registers.

## Changes

- Cloned the full official Git mirror to `/home/dev/hedgewars-upstream`, separate from the app Git repository. Its origin is `https://github.com/hedgewars/hw.git`; inspected `master` commit is `54437aa1a9078f77b0103f1df0aa81f4edc1be05`, and `git rev-parse --is-shallow-repository` returned `false`. The checkout is reference-only, is not a build dependency, and is not included in app clones.
- Confirmed candidate character and weapon sprites, maps, themes, sounds, music, and Pascal engine modules. Updated `REUSE_PLAN.md`, `ASSET_REGISTER.md`, `HANDOFF.md`, and the outdated hosting/reference note in the root README. No upstream material was copied into the app.
- Upstream exposes engine-library and JavaScript build options, but the web wrapper files are empty. No upstream build or authoritative-engine integration was attempted; a feasibility spike would be needed before revising the accepted TypeScript architecture.
- Downloaded Playwright Chromium into the user cache and extracted missing Debian browser libraries under `/home/dev/.cache/hedge-playwright-deps`; no system packages were installed.

## Verification

| Command / manual scenario | Observed result | Limits / evidence |
| --- | --- | --- |
| `npm run check` | PASS | Typecheck, two Node tests, documentation checks, and production builds. The existing large Phaser chunk warning remains. |
| `npm run test:e2e` | Initially failed to launch | The LXC lacked Playwright's Chromium; after installing it, system libraries including `libnspr4.so` were also absent. |
| `LD_LIBRARY_PATH=/home/dev/.cache/hedge-playwright-deps/root/usr/lib/x86_64-linux-gnu npm run test:e2e` | PASS | 10 desktop and Android-emulation browser tests; no actual Android device was tested. |
| `npm run test:dev` | NOT RUN | No development launcher or proxy changes in this session. |
| `systemctl is-active yizhaklub.service`, `systemctl is-enabled yizhaklub.service` | active, enabled | Existing service was not restarted. |
| `curl http://127.0.0.1:9999/api/health` | PASS | Returned `status: ok` and `stage: foundation`. |

## Handoff

- Next: start SIM-01 as described in the checklist, then implement terrain and physics in dependency order. Resolve licensing and record each actual asset or code port before importing it.
- Playwright's downloaded browser and extracted libraries are user-local caches, not system-wide dependencies. A plain `npm run test:e2e` will still require system libraries or the documented `LD_LIBRARY_PATH`.
- Existing `yizhaklub.service` remains running on port 9999; test servers and the clone process exited.
- App documentation changes are local; the upstream clone is outside the app repository. No push or deployment was performed in this session.
