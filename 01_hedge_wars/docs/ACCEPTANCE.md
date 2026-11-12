# Acceptance criteria

Each ID is a gate, not a test result. Evidence and completion live in CHECKLIST, HANDOFF and session logs. Foundation acceptance is separate from game release acceptance. Automated browser emulation never substitutes for actual Android evidence.

## Foundation

| ID | Pass condition | Evidence |
| --- | --- | --- |
| FND-A01 | Clean `npm ci`, strict typecheck and production builds succeed from root; no native Android SDK/database required. | command results and committed lockfile |
| FND-A02 | Root serves the Ukrainian chooser; its game link opens `/games/hedge-wars/`; back link returns to root; direct game URL works. | production browser integration |
| FND-A03 | Workshop is honestly labelled unfinished and visibly interactive; all authored UI/accessibility strings are Ukrainian; no fake multiplayer actions. | browser checks and copy review |
| FND-A04 | Health/catalogue endpoints work; valid hello is accepted; malformed/oversized/incompatible messages and foreign browser origins are handled safely. | contract and real-socket tests |
| FND-A05 | 360px mobile and desktop layouts have no horizontal overflow; focus works; reduced motion suppresses decoration; no console/page errors. | browser integration, visual review |
| FND-A06 | Specs, ordered checklist, agent rules, handoff, session template, runbook and provenance records exist with valid relative links. | doc check and manual review |
| FND-A07 | Git remote points to supplied repository; local commit exists; GitHub contains that commit, or a documented credentials blocker leaves FND-07 open. | git status/log/remote evidence; synchronization never implied |

## Simulation

| ID | Pass condition | Evidence |
| --- | --- | --- |
| SIM-A01 | World state serializes/restores; chosen units/timestep are documented; same seed and commands reproduce state in the server runtime. | fixtures/replay tests |
| SIM-A02 | Craters modify only the specified area; map boundaries do not crash; empty/solid semantics and revisions remain valid. | mask fixtures/invariants |
| SIM-A03 | Fast projectiles do not pass through thin ground; bounce, fuse and wind match selected documented behavior. | collision/trajectory fixtures |
| SIM-A04 | Movement/jump/fall/drowning work at edges, slopes and newly removed support without permanent overlap or permanently unsettled character state. | scenario tests |
| SIM-A05 | Explosion damage, knockback, chains and elimination are ordered consistently; cosmetics do not affect outcomes. | scenario tests |
| SIM-A06 | Simulation imports no DOM/Phaser/network APIs; performance is measured at the selected map size and entity budget. | dependency review and benchmark report |

## Networking

| ID | Pass condition | Evidence |
| --- | --- | --- |
| NET-A01 | 2–4 distinct sessions can create/join/ready/start; fifth player is rejected; rooms do not share state. | multi-client integration |
| NET-A02 | Wrong-owner, stale, duplicate, malformed and out-of-turn inputs cannot mutate another team's or room's state. | adversarial contract/match tests |
| NET-A03 | Every connected client converges to server health, positions, turn, inventory and terrain revision after effects settle. | state/hash comparisons |
| NET-A04 | Disconnect clears held inputs; resume within documented grace restores ownership and current state without replaying stale commands. | forced disconnect/resume integration |
| NET-A05 | Missing terrain updates trigger repair; no permanent divergent terrain after recovery. | dropped/duplicated revision scenarios |
| NET-A06 | Protocol/rules/content mismatch is rejected before play with useful Ukrainian feedback. | incompatible-client integration |
| NET-A07 | Proxy disconnect and room host departure have documented outcomes; logs contain no tokens or raw personal content. | real-route/manual evidence and log review |

## Android UI

| ID | Pass condition | Evidence |
| --- | --- | --- |
| UI-A01 | Touch targets >=48px, readable health/team identity, safe areas and no required horizontal scrolling in menus. | device/layout review |
| UI-A02 | Holding movement plus aim/fire with independent fingers works; leaving a button, cancellation, lock and focus loss never leave held input active. | real Android multitouch log/video |
| UI-A03 | Camera gestures do not steal action touches; aim/charge feedback responds locally; remote motion is smooth at measured RTT. | actual-domain phone test |
| UI-A04 | Every product string/error/accessible name is Ukrainian; audio needs a gesture and can be muted; reduced motion is respected. | copy/accessibility/audio review |
| UI-A05 | Rendering sustains >=30 FPS on the agreed oldest device for the documented scenario; record device, resolution and frame-time evidence. | reproducible device measurement |
| UI-A06 | At least two actual Android devices have tested controls and lifecycle; browser emulation is labelled separately. | device matrix |

## Complete game and release

| ID | Pass condition | Evidence |
| --- | --- | --- |
| GAME-A01 | All 2–4 players receive fair server-managed turns; shot resolution/falling completes before turn transition; timers cannot be manipulated by clients. | state-machine scenarios |
| GAME-A02 | Rocket and grenade support selected parameters, inventory and damage; eliminated teams cannot act; last surviving team wins. | complete-match integration |
| GAME-A03 | Results, rematch and return-to-hub work without leaked listeners, sessions or active matches. | repeat-cycle integration |
| GAME-A04 | Four human players on four devices complete a match through the real domain with elimination, reconnect and rematch. | dated family playtest with devices/build |
| PWA-A01 | HTTPS manifest/icons allow Android installation and standalone launch of hub/game deep links. | installed-device evidence |
| PWA-A02 | Initial assets cache correctly; new builds activate between matches; no forced reload during an active match. | two-version update test |
| PWA-A03 | Incompatible stale client recovers with Ukrainian guidance; obsolete caches are cleaned. | client/server mismatch test |
| PWA-A04 | App-switch/lock resume restores authoritative state or clearly reports expired session. | real-device lifecycle test |
| PWA-A05 | Offline/server-unreachable state explains availability honestly; UI caching is never advertised as offline multiplayer. | offline test |
| OPS-A01 | User-controlled origin serves both apps and WSS under the approved domain without external gameplay infrastructure. | actual-route checks |
| OPS-A02 | VM launcher, logs, startup/shutdown, rollback and version checks work using documented service conventions. | operational rehearsal |
| OPS-A03 | Origin restart leaves clients in a clear recoverable state; private access and message limits are verified before publication. | restart/access test |
| OPS-A04 | Selected content and ported code have provenance, attribution and required source/license material; no Warlings proprietary imports. | asset/reuse register audit |

