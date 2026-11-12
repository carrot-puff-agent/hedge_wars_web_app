# Hedge Wars technical specification

Version: 0.1, 2026-11-12. Status: approved direction from project discussion; unimplemented behavior below is a target, not a completion claim. See CHECKLIST and HANDOFF for observed state.

## Goal and first playable scope

Private family artillery game, 2–4 human players on separate Android devices, Ukrainian UI, client rendering, server-controlled physics and destructible terrain. Choose the game from the parent hub, create/join a private room, configure teams, ready up, play to victory and return for a rematch.

Initial playable target: one curated static map; one team per player, three characters per team; free-for-all; impact rocket and bouncing timed grenade; movement, jump, aiming, charging, wind, health, explosion damage/knockback, falling and drowning; configurable turn duration; results and rematch. Three characters and the initial 45-second turn are starting defaults, to tune through family playtesting. Prefer cartoon presentation and gentle loss messages.

First release excludes AI, campaigns, spectators, seamless server-crash recovery, rope mechanics, procedural maps, downloadable content, ranked play, accounts/payments and offline multiplayer. These remain possible later. Local hotseat is optional future work, not a substitute for device multiplayer.

## Modules

| Module | Inputs | Outputs / responsibilities |
| --- | --- | --- |
| protocol | untrusted messages | validated commands/events, compatibility IDs and errors |
| simulation | world state, ordered commands, tick, seeded RNG | next state and gameplay events |
| server match runner | connected players and their inputs | authoritative simulation ticks, ordered events/snapshots |
| client game | server state/events and local input | presentation, control feedback, interpolation/prediction |
| terrain renderer | immutable initial content + sequenced edits | changed texture regions, without deciding collision outcomes |

All transient simulation state is explicit and serializable. Use world units independent of screen pixels. Document conversions for every imported parameter. Initially use a fixed 60 Hz simulation candidate with projectile substeps/swept checks to avoid tunnelling; benchmark against gameplay fidelity and map size before freezing SIM-01. Do not copy Hedgewars per-tick values into this rate unchanged. Rendering frequency and network update cadence are independent.

## Terrain and physics

- Start with a bounded 2048x1024 candidate mask, one byte per cell, with explicit empty/solid semantics. Confirm device/server costs before finalizing this baseline.
- Server owns the terrain and character/projectile collision results. Pure terrain queries and edits can be shared with clients.
- Explosions clear bounded mask regions, calculate radial effects and emit terrain/damage/motion events. Renderer adds borders and particles separately.
- Track dirty chunks/rectangles. Network terrain changes have match ID, sequence, revision and integrity information. A missing/incompatible revision triggers a snapshot, not silent divergence.
- Avoid full terrain texture uploads and full-mask network transfers every frame. Full snapshots are for join/recovery/checkpoints.
- Correctness cases include map boundaries, narrow ledges, holes, overhangs, projectile tunnelling, multi-object explosion chains and terrain removal beneath a character.
- Seed gameplay randomness on the server; use a separate cosmetic RNG for particles. Visual effects must not change game outcomes.

## Match lifecycle and authority

Room lifecycle: `waiting -> ready -> playing -> results -> waiting`, plus closed/abandoned states. Host ownership selects shared settings; each session owns exactly one team. A player cannot move or fire another player's team or send commands outside its active turn.

Turn lifecycle: `select -> control -> resolve -> settle -> next`, with victory checked after the necessary damage/fall/explosion resolution. Do not advance a turn merely because the timer expired while a projectile is still resolving. Define and test what ends input and how much post-shot retreat time exists before adding that feature.

Use server ticks for gameplay and turn deadlines. The frontend clock is decorative. Serialize commands into a stable order and reject stale/duplicate/out-of-turn commands. Each active match must remain isolated from other rooms.

## Network design

Secure WebSocket under the same origin; JSON metadata/control messages first, bounded binary terrain transport only when justified by measurement. Validation is mandatory at the boundary. Never evaluate client-supplied scripts or accept client-computed health/terrain as authoritative.

Foundation protocol v1 contains only `client.hello`, `server.hello` and `server.error`. Versioned gameplay messages will be introduced deliberately at NET-01. The hello capability list must remain empty until actual capabilities exist.

Planned message families:

- Session resume/create; room create/join/leave; team settings; ready and start.
- Input commands with match ID, command ID/sequence, client intent and server acknowledgement.
- Match snapshot with tick, players, terrain revision, active turn, physics/rules/content versions and inventories.
- State deltas, ordered gameplay events and terrain updates.
- Heartbeat, compatibility failures, departure, resume and match results.

Snapshots must not reveal other players' session credentials. Resume uses a server-issued unguessable credential, never merely a nickname. Enforce limits for payloads, commands, rooms and sessions before Internet exposure. Sanitise player names and map all player-facing errors into Ukrainian.

Compatibility negotiation includes protocol version, simulation/rules version and curated content manifest hash. Reject mismatch before a match starts, explain it in Ukrainian and offer a safe reload outside a match. Application build version alone does not prove identical content.

Server state plus a reconnect grace policy handles browser suspension/network loss. Initial proposed grace: 120 seconds, configurable; room host can choose a family-friendly shared pause policy. During lost ownership, clear pressed inputs. NET-04 must finalize and test timeout/forfeit rules explicitly. Server restarts may end an active match in v1; returning players receive a clear message rather than a phantom resume.

## Client, touch and camera

Phaser handles render objects and input; DOM handles accessible menus/status. Landscape match layout with safe areas, at least 48 CSS-pixel action targets, independent simultaneous touch control, aim/power feedback without a network round trip and interpolated remote motion. Camera pan/zoom must not steal action-control touches. Handle cancellation, blur and visibility changes so controls cannot remain stuck.

Test whether movement prediction is necessary on the real Cloudflare route. If used, reconcile with server state using shared simulation functions. Client prediction never changes the server's collision/damage authority. Audio starts after a gesture. Reduced-motion mode suppresses unnecessary effects.

## Content and reuse

Select a small licensed content set. Read the REUSE_PLAN and asset register before importing anything. Record upstream commit/path, license, changes, units and verification fixtures for every ported subsystem. No proprietary Warlings assets/code. Exact reproduction of every Hedgewars quirk is not a requirement; intentional behavior changes must be documented.

## Operational and performance acceptance

Single-process local origin initially; no database needed for the foundation. Persist configuration deliberately; avoid prematurely adopting accounts or a hosted database. JSON runtime logs contain timestamps, event code, build, match/room pseudonymous identifiers where needed, and error context without secrets or raw player input dumps.

Planned performance budget: stable >=30 FPS on the agreed oldest target phone, no sustained main-thread stalls during ordinary explosions, and acceptable input response on the actual domain. Record frame times, server tick duration, RTT and terrain payload sizes before selecting final thresholds. Capacity acceptance is four players in one match; larger loads are outside v1.

The release gate is a complete four-device match through HTTPS/WSS, including reconnect, incompatible-client rejection, victory and rematch. Local tabs, bots, successful compilation and a hello handshake do not satisfy it.

