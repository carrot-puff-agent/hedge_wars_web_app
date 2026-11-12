# ADR 0001 — repository, web client and authority

Date: 2026-11-12. Status: accepted foundation assumption, revisable by the user.

## Context

The user supplied a repository named `hedge_wars_web_app`, required the first game's project at `/home/coder/_PROJECTS/07_games_web_app/01_hedge_wars`, and required the welcome page at the parent, with more games later. They favor PWA delivery, own-server computation and Ukrainian playful UI.

## Decisions

1. Root the supplied Git repository at `07_games_web_app`; keep the first game's implementation and documents inside `01_hedge_wars`. This ensures the hub, cross-game catalogue and agent instructions are preserved in the same clone. There is no nested Git repository.
2. Use a TypeScript/Phaser browser client and Node/WebSocket server. Keep simulation separate and authoritative on the server. Selectively port Hedgewars behavior; do not rebuild its native Pascal/SDL toolchain or assume its command-relay server runs the new physics.
3. Use a lightweight hub with a typed catalogue. Keep the first backend in the first game for now; extract a platform host when a second backend integration makes it necessary. This extraction is an explicit tracked task.
4. Ship a foundation preview first. Do not implement a partial untested artillery game under the label of a completed multiplayer game.
5. Keep runtime logs/builds local and ignored, with durable progress and evidence in Markdown. Preserve component licenses; decide the repository's code license before importing upstream code. GPL-compatible reuse is the expected direction, subject to recording the actual imports.

## Consequences

One clean checkout reproduces both the hub and game. The repository name is narrower than the future platform scope, which is acceptable. Browser delivery and shared TypeScript simplify iteration. Terrain performance, Android interaction and reconnect reliability remain unproven until measured. Later architectural changes require a new ADR and checklist/spec updates.

