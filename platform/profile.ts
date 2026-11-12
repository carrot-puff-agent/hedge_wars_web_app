/**
 * Cross-game player profile (name + 10 distinct team colors + sound unlock)
 * persisted in device localStorage.
 */

export const PLAYER_NAME_KEY = 'yizhaklub.playerName';
export const PLAYER_COLOR_KEY = 'yizhaklub.playerColor';
export const LEGACY_HEDGE_NAME_KEY = 'yizhaklub.hedgeWars.playerName';
export const LEGACY_HEDGE_COLOR_KEY = 'yizhaklub.hedgeWars.playerColor';
export const MUTE_STORAGE_KEY = 'yizhaklub.hedge.muted';

export const PLAYER_COLOR_PRESETS_UK = [
  { colorIndex: 0, name: 'Бурштинові', symbol: '●', hex: '#c87416' },
  { colorIndex: 1, name: 'Рубінові', symbol: '▲', hex: '#b63d32' },
  { colorIndex: 2, name: 'Смарагдові', symbol: '■', hex: '#28724f' },
  { colorIndex: 3, name: 'Лазурові', symbol: '◆', hex: '#285e8e' },
  { colorIndex: 4, name: 'Фіалкові', symbol: '★', hex: '#7a3eb8' },
  { colorIndex: 5, name: 'Бірюзові', symbol: '✦', hex: '#148578' },
  { colorIndex: 6, name: 'Рожеві', symbol: '♥', hex: '#c43670' },
  { colorIndex: 7, name: 'Лаймові', symbol: '❖', hex: '#5f8d18' },
  { colorIndex: 8, name: 'Індигові', symbol: '⬢', hex: '#3946a8' },
  { colorIndex: 9, name: 'Коралові', symbol: '☀', hex: '#d4572a' },
] as const;

export function loadCachedPlayerName(): string {
  try {
    return (
      localStorage.getItem(PLAYER_NAME_KEY)?.trim() ||
      localStorage.getItem(LEGACY_HEDGE_NAME_KEY)?.trim() ||
      ''
    );
  } catch {
    return '';
  }
}

export function loadCachedColorIndex(): number {
  try {
    const raw =
      localStorage.getItem(PLAYER_COLOR_KEY) ?? localStorage.getItem(LEGACY_HEDGE_COLOR_KEY);
    if (raw === null) return 0;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed >= 0 && parsed < PLAYER_COLOR_PRESETS_UK.length
      ? parsed
      : 0;
  } catch {
    return 0;
  }
}

export function savePlayerPreferences(name: string, colorIndex: number): void {
  try {
    const clampedColor =
      Number.isInteger(colorIndex) && colorIndex >= 0 && colorIndex < PLAYER_COLOR_PRESETS_UK.length
        ? colorIndex
        : 0;
    const trimmed = name.trim();
    if (trimmed.length > 0) {
      localStorage.setItem(PLAYER_NAME_KEY, trimmed);
      localStorage.setItem(LEGACY_HEDGE_NAME_KEY, trimmed);
    }
    localStorage.setItem(PLAYER_COLOR_KEY, String(clampedColor));
    localStorage.setItem(LEGACY_HEDGE_COLOR_KEY, String(clampedColor));
  } catch {
    // ignore storage errors in restricted environments
  }
}

export function enableSoundFromLobbyGesture(): void {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, '0');
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      void ctx.resume().then(() => ctx.close()).catch(() => {});
    }
  } catch {
    // ignore
  }
}
