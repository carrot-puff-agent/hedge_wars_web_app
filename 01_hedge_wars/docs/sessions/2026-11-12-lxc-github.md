# 2026-11-12 — LXC GitHub SSH and development handoff

- Scope: user requested copying their existing GitHub SSH key to the LXC and ensuring future agents can develop and push from there.
- Primary checkout: `/home/dev/games-web-app`; GitHub remote: `git@github.com:carrot-puff-agent/hedge_wars_web_app.git`.
- Existing GitHub SSH key copied to `~/.ssh/codex_github_ed25519` for LXC user `dev`; directory mode 700, private key/config mode 600. No private material is in the repository, logs or Git bundle. SSH config selects the key for github.com; GitHub's Ed25519 host key was checked against its published fingerprint.
- SSH authentication succeeds as `carrot-puff-agent`. Git's repository-local identity uses that bot account's GitHub noreply address. Global Git settings remain unchanged.
- Imported the original VM's entire existing `main` history without overwriting the LXC worktree. Restored the tracked `.env.example` template that had been excluded by the original deployment; it contains no secrets. `main` tracks `origin/main`.
- `git push --dry-run` passed; initial normal push succeeded. At the time of verification, local and remote `main` both pointed to `330b49c585d1dcede1d46867ad0e80136ad94f83`; this documentation follow-up advances them together.
- Updated root/game agent instructions, README and operations/handoff to identify the LXC as the primary development checkout. Original VM and LXC are separate working copies: inspect Git status and fetch before synchronizing; never overwrite uncommitted LXC work from the VM.
- LXC `yizhaklub.service` remained active throughout. No application code or Cloudflare policy was changed. Next project task: SIM-01.
