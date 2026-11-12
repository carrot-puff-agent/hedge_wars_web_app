# Instructions for every agent working in this repository

## Authority and boundaries

- Repository root: `/home/coder/_PROJECTS/07_games_web_app`.
- Remote: `https://github.com/carrot-puff-agent/hedge_wars_web_app`.
- Hub source: `hub/`. Hedge Wars source, implementation plan and game documents: `01_hedge_wars/`.
- One Git repository at the parent root. Do not initialize a nested repository or move game code into the hub.
- Read `/home/coder/_notes_to_agent/basic_deployment_notes_for_ai_agent.md` on this VM. Its service/package conventions apply. Never read or alter `.secrets`.
- Other projects are read-only references unless the user explicitly expands scope. In particular, do not modify `06_warlings_remake` or its Hedgewars checkout.
- Follow the user's current instructions first. Do not infer permission to contact people, change domain/DNS settings, or publish a live service from routine development work.

## Start a session in this order

1. Read this file, `README.md`, and `docs/STATUS.md`.
2. For game work, read `01_hedge_wars/AGENTS.md` and `01_hedge_wars/docs/HANDOFF.md`.
3. Read the relevant specification, `01_hedge_wars/docs/CHECKLIST.md`, `ACCEPTANCE.md`, and the latest session log. Read applicable ADRs before changing architecture.
4. Run `git status --short --branch`; inspect existing changes before editing. Preserve unfinished work from the user or another session.
5. Select the next unblocked checklist item. Mark it `IN PROGRESS` with a session identifier in its notes before substantial implementation. Do not silently expand scope.

## Product rules

- Every user-visible string is Ukrainian, including errors, loading states, accessibility labels, dialogs and connection notices. Code, logs and technical documentation can be English.
- Style: funny, playful, warm, interactive and suitable for children. See `docs/UI_GUIDELINES.md`.
- Clearly distinguish the foundation preview from a playable game. Never advertise multiplayer, installability, offline matches or reconnect support before their acceptance gates pass.
- Simulation is authoritative on the user's server. Clients render, collect input and may predict; the server decides outcomes.
- No mandatory proprietary game backend. Cloudflare is replaceable HTTPS/WSS ingress, not the owner of match state.

## Work discipline and housekeeping

- Use npm workspaces and the committed root `package-lock.json`. Install from the root with `npm ci`; do not add competing lockfiles.
- Put game code inside `01_hedge_wars/`; shared catalogue and hub concerns belong at the parent level. Avoid cross-imports from one game's implementation into another game.
- Keep simulation modules independent of DOM, Phaser, sockets and wall-clock time. Keep protocol validation at the network boundary.
- Keep changes focused. Avoid unrelated dependency upgrades, formatting sweeps and speculative abstractions.
- Add assets only with recorded origin/license in `01_hedge_wars/docs/ASSET_REGISTER.md`. A translation of upstream code is still a port; record it in the reuse register.
- Generated builds, dependencies, runtime logs, screenshots and local experiments belong in ignored `dist/`, `node_modules/`, `.local/`, `test-results/` or `playwright-report/`. Durable evidence should be summarized in versioned Markdown.
- Never commit tokens, environment files, access cookies, private room credentials or personal player data. Do not copy secrets into logs.
- Use `sudo agent-apt` for system packages and `sudo agent-service` with launchers in `~/.config/agent-services/` for persistent VM services. Ordinary development processes may run in a terminal and must be stopped when finished.
- Do not change Git global identity, remote repository visibility, authentication configuration or unrelated services. Never force-push or discard existing work.

## Checks and evidence

- Run `npm run check` for a foundation/code change. Run targeted tests while iterating; repeat broader checks when the final change warrants them.
- Run `npm run test:e2e` for routing, protocol integration or browser behavior changes. Browser installation: `npx playwright install chromium`; this VM can also use `/usr/bin/chromium`.
- Run `npm run test:dev` when changing the dev launcher or proxy configuration. It covers the same browser paths through Vite and must keep both game HMR and application WebSockets working.
- Do not add tests that merely mirror a low-impact style edit. Test meaningful state transitions, networking, collision invariants and regressions.
- Actual Android multitouch, background behavior, PWA installation and four-device matches require real-device evidence. Desktop emulation is not proof.
- List commands and results, including anything not run. Never turn an expected result into a claimed observation.

## End a session / transfer work

1. Update checklist task statuses with concise evidence and remaining blockers. Keep task IDs stable. A checkbox means the listed acceptance evidence exists.
2. Update `docs/STATUS.md` for platform-level changes and `01_hedge_wars/docs/HANDOFF.md` for game state, next task and exact continuation steps.
3. Append a dated entry under `01_hedge_wars/docs/sessions/` using the template. Record files/decisions, commands/results, blockers and processes left running. Redact sensitive values.
4. Update affected specs and acceptance criteria in the same change. Record architectural changes as a new ADR; do not silently rewrite accepted decisions.
5. Run `git diff --check` and inspect `git status`. Make a focused commit when appropriate; report push failures honestly. Do not claim GitHub contains work that exists only locally.
6. Final response: what exists, where it lives, checks performed and material limits. Include the next unblocked task when the game is incomplete.

