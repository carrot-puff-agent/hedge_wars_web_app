# Hedge Wars agent instructions

Read and follow `../AGENTS.md` first. Game root is `01_hedge_wars/` under the repository root: `/home/dev/games-web-app/01_hedge_wars` on the LXC, or `/home/coder/_PROJECTS/07_games_web_app/01_hedge_wars` on the original VM. Git commands run from the parent repository root.

## Required context

Read `docs/HANDOFF.md`, `docs/TECH_SPEC.md`, `docs/CHECKLIST.md`, `docs/ACCEPTANCE.md` and the latest file in `docs/sessions/`. For upstream-related work also read `docs/REUSE_PLAN.md` and `docs/ASSET_REGISTER.md`.

## Design boundaries

- `client/`: rendering, input, animations, camera, presentation, interpolation and limited prediction.
- `server/`: connection/session/room lifecycle and authoritative match orchestration. Only the server can decide turns, collisions, terrain changes, inventory, damage and victory.
- `packages/protocol/`: runtime-validated, versioned wire contracts. Unknown or malformed messages must not mutate a match.
- `packages/simulation/`: future pure simulation with explicit fixed timestep, seeded RNG, typed state and no Phaser/DOM/socket imports. Do not tie simulation speed to rendering or network frequency.
- Imported upstream behavior needs provenance, dependency notes, unit/timestep conversion and representative verification. Copy no Warlings proprietary code/assets.
- Four players means separate devices and owned teams. Four bots or four local teams do not prove network multiplayer.

## Task and handoff rules

`docs/CHECKLIST.md` is the canonical task list. `[ ]` means TODO, `[~]` means IN PROGRESS, `[x]` means DONE and `[!]` means BLOCKED. Mark completion only with linked evidence and passing acceptance IDs. Dependencies listed in a phase must be satisfied before its release claim. Partial work stays open.

Use stable task IDs in session logs and commits. Update specs when behavior changes. Acceptance criteria are the definition of done; a changed criterion must be explicit and justified, never silently relaxed to turn a test green.

At session end, update `docs/HANDOFF.md` with exact next actions, commands, failures and any running processes. Append a session log rather than overwriting history. Manual Android gates stay open until an actual device/model and observation are recorded. No automatic deployment, Cloudflare configuration or production restart is implied by code completion.

