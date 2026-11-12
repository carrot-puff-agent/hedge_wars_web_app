# Ukrainian UI and interaction rules

These rules apply to the hub, every game, PWA prompts, validation messages and accessibility labels.

## Voice

Ukrainian only in the product. Friendly, silly and understandable to children. Prefer short verbs and concrete feedback. No humiliating losing messages, aggressive monetization, account pressure or developer jargon in ordinary flows. Technical docs/logs remain English.

Examples: «Нумо грати!», «До клубу», «Їжачок уже розминається», «Зв’язок загубився. Повертаємося до гри…», «Тут потрібен ще один бешкетник». Never show raw exception messages or protocol codes directly to players.

Clearly label unfinished features: «Ще майструємо», «Зазирнути в майстерню». Do not use «Грати онлайн» until the online-match acceptance criteria pass. A game preview should be fun without pretending to be a match.

## Visual direction

Warm paper/cream background, ink-dark text and friendly accents. The hub is a concise, game-neutral full-viewport app screen, with functional game cards and no game-specific mascot or marketing sections. Use locally available system fonts initially; bundle and license a Ukrainian-capable font if one is later selected.

Keep the game field dominant during matches. Controls must remain legible over terrain, with separate camera and action gestures. Health/team identity uses text or symbols as well as color.

## Interaction and accessibility

- At least 48x48 CSS-pixel touch targets, generous spacing and safe-area insets.
- Independent ownership of simultaneous touches; moving one finger must not release another control. Clear all pressed inputs on cancellation/focus loss.
- `touch-action: none` only on the game/control surface, not on the hub's game list. Keep the document within the viewport; when future game cards exceed its available area, allow scrolling inside that list rather than clipping actions.
- Visible keyboard focus, semantic buttons/links, Ukrainian accessible names, live status announcements without constant chatter.
- Respect `prefers-reduced-motion`. Effects must not block input or essential text. Do not rely on vibration, sound or animation alone to communicate outcomes.
- Sound begins only after user interaction and has an accessible mute control once audio exists. Never display a pretend audio toggle.
- Do not force PWA updates, reloads or disruptive prompts during a match. Keep debug/status overlays behind a deliberate development mode.

Foundation browser checks cover text, navigation, responsive layout, reduced motion and console errors. Actual touch feel, screen edges and safe areas require Android device testing.

