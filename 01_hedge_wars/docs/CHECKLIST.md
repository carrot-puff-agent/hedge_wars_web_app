# Ordered implementation checklist

Canonical task list. `[ ]` TODO · `[~]` IN PROGRESS · `[x]` DONE · `[!]` BLOCKED. Stable IDs are referenced in acceptance criteria and session logs. Mark done with evidence; leave manual gates open. Current session: `2026-11-12-foundation`.

## Phase 0 — reproducible project foundation

Dependencies: none. Gate: FND-A01–FND-A07. Foundation does not imply a playable game.

- [x] FND-01 — Create root workspace, game boundaries, lockfile and local scripts. FND-A01: clean `npm ci` and `npm run check` passed; see foundation session log.
- [x] FND-02 — Write platform/game specs, UI rules, checklist and measurable acceptance criteria. FND-A06: document checker validates required files, links and 44 unique task IDs.
- [x] FND-03 — Write agent rules, handoff, session template, operations and reuse/asset records. FND-A06: records exist and links pass.
- [x] FND-04 — Implement Ukrainian game chooser, real game route and accessible playful workshop preview. FND-A02/A03/A05: desktop/mobile browser checks and visual review passed.
- [x] FND-05 — Implement validated hello protocol, health/catalogue endpoints and safe static routing. FND-A04: real-socket and HTTP tests passed, including rejection paths.
- [x] FND-06 — Add CI, meaningful contract/server/browser smoke checks; run locally and record results. Two unit/integration tests and four browser tests in each of production/development modes passed. CI execution on GitHub is not yet observed.
- [~] FND-07 — GitHub SSH key copied to the LXC and SSH authentication verified as `carrot-puff-agent`. Importing the existing Git history and verifying push; session 2026-11-12-lxc-github.
- [x] HUB-01 — Game-neutral Ігротека chooser and Material controller app icon deployed on LXC. Viewport, authenticated manifest, offline shell and ten browser checks passed; see session 2026-11-12-hub-redesign. Real Android launcher icon refresh remains an observation to collect.
- [x] HUB-02 — Renamed the hub, game header and manifest to «Наші ігри» and deployed to the LXC. Build, ten browser checks and live route/manifest verification passed. Android launcher name refresh remains to be observed; see session 2026-11-12-app-rename.

## Phase 1 — pure simulation and terrain

Dependencies: FND-01–FND-06. Gate: SIM-A01–SIM-A06.

- [ ] SIM-01 — Add simulation workspace, serializable world state, seeded RNG, explicit units and fixed-step decision. Record map/tick budget measurements.
- [ ] SIM-02 — Build initial mask loader and rectangle/chunk revision tracking. Add edge/size validation.
- [ ] SIM-03 — Port/adapt circular terrain edits with crater fixtures, boundary cases and provenance.
- [ ] SIM-04 — Add terrain/object collision and swept/substep projectile checks; verify narrow ledges and fast projectiles.
- [ ] SIM-05 — Add character grounding, movement, jump, falling and drowning; keep rendering separate.
- [ ] SIM-06 — Add impact rocket and timed bouncing grenade behavior, seeded wind, damage/knockback and settling.
- [ ] SIM-07 — Validate representative trajectories, crater results, bounce/fuse timing, repeatability and serializable snapshots.

## Phase 2 — two devices, then four devices

Dependencies: Phase 1. Gate: NET-A01–NET-A07. Build multiplayer before expanding the weapon catalogue.

- [ ] NET-01 — Extend/version contracts for sessions, rooms, inputs, snapshots, events and terrain revisions.
- [ ] NET-02 — Create/join private room, own team, ready, start, leave; enforce 2–4 player capacity and room isolation.
- [ ] NET-03 — Add authoritative fixed-step match runner, command ownership/order/duplicate checks and state delivery.
- [ ] NET-04 — Implement heartbeat, bounded reconnect, input release, grace period and documented pause/forfeit rules.
- [ ] NET-05 — Add full reconnect snapshots and terrain revision/checksum recovery.
- [ ] NET-06 — Reject incompatible protocol/rules/content versions before start; Ukrainian reload/error flow.
- [ ] NET-07 — Prove two browser clients, then four, exchange owned inputs and converge to server simulation/terrain state. Record delayed/lost-connection tests and payload/tick metrics. Full-match completion is GAME-04.
- [ ] NET-08 — Validate limits, session ownership and safe logs; authorize exposure to external clients only when ready.

## Phase 3 — playable Android client

Dependencies: Phase 2; renderer can begin after SIM-03. Gate: UI-A01–UI-A06.

- [ ] UI-01 — Replace workshop preview with match renderer, changed-region terrain textures and camera behavior.
- [ ] UI-02 — Add Ukrainian room/lobby/team/weapon/results flows with honest connection and loading states.
- [ ] UI-03 — Add independent multitouch movement/aim/fire/charging controls, cancellation and safe-area support.
- [ ] UI-04 — Interpolate remote motion; measure real-route control latency and add/reconcile prediction where justified.
- [ ] UI-05 — Add licensed audio/animations, mute, readable team identity and reduced-motion behavior.
- [ ] UI-06 — Test on the actual oldest family Android phone and another phone; record models, Chrome versions and touch observations.

## Phase 4 — complete game loop

Dependencies: Phases 1–3. Gate: GAME-A01–GAME-A04.

- [ ] GAME-01 — Implement server turn state machine, timer, pending resolution, elimination and victory.
- [ ] GAME-02 — Finish configurable defaults, team inventories and one curated map/content manifest.
- [ ] GAME-03 — Results, rematch and return-to-hub without duplicate listeners or leaked rooms/processes.
- [ ] GAME-04 — Run complete four-human-device matches including elimination, simultaneous effects, reconnect, victory and rematch.

## Phase 5 — PWA and own-server release

Dependencies: complete game loop and protocol compatibility. Gate: PWA-A01–PWA-A05, OPS-A01–OPS-A04.

- [~] PWA-01 — Versioned PWA shell worker and offline assets implemented, Chrome-emulated tests passed. Match-aware update availability UI and activation between matches remain open. See 2026-11-12-lxc session.
- [~] PWA-02 — Authenticated manifest cookie regression reproduced and fixed; user confirmed Samsung installation works. Standalone launch/deep links and updates over HTTPS still require verification.
- [ ] PWA-03 — Test cached-client/server mismatch, reload recovery and cache cleanup. Do not claim offline multiplayer.
- [ ] OPS-01 — Obtain domain/target host details and configure user-approved HTTPS/WSS ingress (Cloudflare Tunnel or equivalent).
- [~] OPS-02 — Dedicated LXC systemd service enabled, active and restart-tested on port 9999; documented. Actual reboot and rollback rehearsal remain open for OPS-A02. Preserve original VM agent-service conventions on that host.
- [ ] OPS-03 — Test real-route reconnect after proxy interruption, phone lock and server restart; verify safe error states.
- [ ] OPS-04 — Measure oldest-phone FPS, server tick times, RTT and terrain update sizes; tune and record v1 limits.
- [ ] REL-01 — Confirm license choice, complete attribution/source obligations for all imports and release checklist evidence.
- [ ] REL-02 — Run all release acceptance gates, family playtest and user-approved deployment. Record version and recovery instructions.

## Later — more games and optional features

- [ ] MG-01 — Before a second game's backend, extract generic HTTP/static host and dispatch, preserving existing routes and isolation tests.
- [ ] MG-02 — Add second independent game registration/client/server module; update hub and cross-game navigation checks.
- [ ] EXT-01 — Select next family-requested features: more weapons/maps, hotseat, AI, rope, map editor or procedural generation. Scope and accept individually.

