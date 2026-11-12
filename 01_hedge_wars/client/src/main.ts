import {
  CONTENT_HASH,
  MAX_ROOM_PLAYERS,
  PROTOCOL_VERSION,
  RULES_VERSION,
  ServerMessage,
  TEAM_PRESETS_UK,
  type ClientMessage,
  type MatchCommandAction,
  type MatchResultsSummary,
  type PublicRoomPlayer,
  type PublicRoomSummary,
  type RoomSettings,
} from '@yizhaklub/hedge-protocol';
import {
  TICKS_PER_SECOND,
  carveCrater,
  computeWorldChecksum,
  deserializeWorldState,
  type WeaponKind,
  type WorldState,
} from '@yizhaklub/hedge-simulation';
import {
  loadCachedColorIndex,
  loadCachedPlayerName,
} from '../../../platform/profile';
import { SoundController } from './audio';
import type { LocalAimFeedback } from './renderer';
import './style.css';

const RESUME_TOKEN_STORAGE_KEY = 'yizhaklub.hedgeWars.resumeToken';

const sound = new SoundController();
sound.setMuted(false);
sound.unlockFromGesture();

function resolvePlayerProfile(): { name: string; colorIndex: number } {
  const colorIndex = loadCachedColorIndex();
  const cachedName = loadCachedPlayerName();
  const preset = TEAM_PRESETS_UK[colorIndex] ?? TEAM_PRESETS_UK[0];
  return {
    name: cachedName.length > 0 ? cachedName : preset.name,
    colorIndex,
  };
}

const initialProfile = resolvePlayerProfile();
const initialPreset = TEAM_PRESETS_UK[initialProfile.colorIndex] ?? TEAM_PRESETS_UK[0];

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="game-viewport">
    <!-- Full-screen game canvas -->
    <div id="field" class="field-canvas" role="img" aria-label="Сонячна галявина їжачків. Ігрове поле баталій."></div>

    <!-- Neutral backdrop for room lobby & results (ready for blurred artwork later) -->
    <div id="lobby-backdrop" class="lobby-backdrop" aria-hidden="true"></div>

    <!-- Floating Corner Top Bar (visible in room lobby) -->
    <header id="menu-topbar" class="menu-topbar">
      <a class="corner-pill back" href="/" aria-label="До ігор">← До ігор</a>
      <div class="corner-right-group">
        <span id="player-profile-pill" class="profile-pill" style="--team-color: ${initialPreset.hex}">
          ${initialPreset.symbol} ${initialProfile.name}
        </span>
        <span id="connection" class="status-dot" role="status" aria-live="polite" title="З’єднання з сервером">Онлайн</span>
      </div>
    </header>

    <!-- Error / Reload Toast -->
    <div id="error-banner" class="floating-toast error-toast" role="alert" hidden>
      <span id="error-text"></span>
      <button id="btn-reload-app" type="button" class="toast-btn" hidden>Оновити</button>
    </div>

    <!-- Disconnect Pause Toast -->
    <div id="pause-banner" class="floating-toast pause-toast" role="status" aria-live="polite" hidden>
      Чекаємо на повернення гравця…
    </div>

    <!-- IN-MATCH FLOATING HUD -->
    <section id="match-hud" class="match-hud-overlay" aria-label="Стан бою" hidden>
      <!-- Top-Left: Circular Timer (press to pass turn) + Leave Button -->
      <div class="hud-top-left">
        <button id="btn-pass-turn" type="button" class="touch-btn timer-circle" aria-label="Пропустити хід" title="Натисни, щоб передати хід">
          <svg viewBox="0 0 64 64" aria-hidden="true" class="timer-svg">
            <path d="M16 14 A24 24 0 1 1 10 38" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
            <polygon points="16,7 22,16 11,17" fill="currentColor"/>
            <path d="M48 50 A24 24 0 0 1 16 50" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
            <polygon points="48,57 42,48 53,47" fill="currentColor"/>
          </svg>
          <span id="turn-timer-label" class="timer-number">45</span>
        </button>

        <button id="btn-match-leave" type="button" class="square-icon-btn" aria-label="Вийти з бою" title="Вийти з бою">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>

      <!-- Top-Right: Horizontal Timer Row (to left of Weapon Chest) + Weapon Chest + Popover Drawer -->
      <div class="hud-top-right">
        <div class="hud-top-right-bar">
          <div id="fuse-row" class="fuse-row" role="group" aria-label="Таймер зброї" hidden>
            <button type="button" class="fuse-btn" data-fuse="1">1с</button>
            <button type="button" class="fuse-btn" data-fuse="2">2с</button>
            <button type="button" class="fuse-btn active-fuse" data-fuse="3">3с</button>
            <button type="button" class="fuse-btn" data-fuse="4">4с</button>
            <button type="button" class="fuse-btn" data-fuse="5">5с</button>
          </div>

          <button id="btn-weapon-crate" type="button" class="crate-btn" aria-label="Арсенал зброї" title="Вибір зброї">
            <svg viewBox="0 0 64 64" aria-hidden="true" class="crate-svg">
              <polygon points="8,22 32,10 56,22 56,46 32,56 8,46" fill="#8b7d5b" stroke="#2c2619" stroke-width="3" stroke-linejoin="round"/>
              <polygon points="8,22 32,32 56,22 32,10" fill="#a89974" stroke="#2c2619" stroke-width="2.5" stroke-linejoin="round"/>
              <line x1="20" y1="16" x2="44" y2="27" stroke="#2c2619" stroke-width="2.5"/>
              <line x1="32" y1="32" x2="32" y2="56" stroke="#2c2619" stroke-width="2.5"/>
              <rect x="40" y="34" width="10" height="7" rx="1" fill="#e6dfc8" stroke="#2c2619" stroke-width="1.5" transform="rotate(-18 45 37)"/>
            </svg>
            <span id="crate-weapon-badge" class="crate-badge" hidden>6</span>
          </button>
        </div>

        <div id="weapon-drawer" class="weapon-drawer" hidden>
          <div class="drawer-meta-row">
            <span id="active-turn-label" class="turn-chip">Твій хід</span>
          </div>
          <div class="weapon-row">
            <button id="btn-weapon-rocket" type="button" class="touch-btn weapon-tile active-weapon" aria-label="Ракета">
              <span class="w-icon">▲</span>
              <span class="w-name">Ракета</span>
              <span id="ammo-rocket" class="w-ammo">99</span>
            </button>
            <button id="btn-weapon-grenade" type="button" class="touch-btn weapon-tile" aria-label="Граната">
              <span class="w-icon">●</span>
              <span class="w-name">Граната</span>
              <span id="ammo-grenade" class="w-ammo">6</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- IN-MATCH MULTITOUCH THUMB CIRCLES (Jump Left / Move Left on Bottom-Left; Jump Right / Move Right on Bottom-Right) -->
    <section id="match-controls" class="match-thumb-controls" aria-label="Керування їжачком" hidden>
      <!-- Bottom-Left: Jump Left above Move Left -->
      <div class="thumb-column thumb-left">
        <button id="btn-jump-left" type="button" class="touch-btn circle-control-btn" aria-label="Стрибок ліворуч">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <polygon points="14,18 40,22 24,42" fill="currentColor"/>
            <circle cx="38" cy="40" r="10" fill="currentColor"/>
          </svg>
        </button>

        <button id="btn-move-left" type="button" class="touch-btn circle-control-btn" data-hold="left" aria-label="Рух ліворуч">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <polygon points="10,32 34,16 34,48" fill="currentColor"/>
            <circle cx="42" cy="32" r="10" fill="currentColor"/>
          </svg>
        </button>
      </div>

      <!-- Bottom-Right: Jump Right above Move Right -->
      <div class="thumb-column thumb-right">
        <button id="btn-jump-right" type="button" class="touch-btn circle-control-btn" aria-label="Стрибок праворуч">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <polygon points="50,18 24,22 40,42" fill="currentColor"/>
            <circle cx="26" cy="40" r="10" fill="currentColor"/>
          </svg>
        </button>

        <button id="btn-move-right" type="button" class="touch-btn circle-control-btn" data-hold="right" aria-label="Рух праворуч">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <polygon points="54,32 30,16 30,48" fill="currentColor"/>
            <circle cx="22" cy="32" r="10" fill="currentColor"/>
          </svg>
        </button>
      </div>
    </section>

    <!-- CENTERED APP DIALOG: ACTIVE ROOMS BROWSER -->
    <section id="entry-panel" class="modal-card" aria-label="Кімнати для гри">
      <h1 class="modal-title">Їжачі баталії</h1>

      <div class="rooms-browser">
        <div class="rooms-browser-header">
          <span>Активні кімнати</span>
          <button id="btn-create-room" type="button" class="game-action-btn primary-action">
            + Створити кімнату
          </button>
        </div>
        <ul id="available-rooms-list" class="available-rooms-list" aria-label="Список доступних кімнат">
          <li class="empty-rooms-hint">Немає активних кімнат — створи власну!</li>
        </ul>
      </div>
    </section>

    <!-- CENTERED APP DIALOG: ROOM SETUP (HOST) / WAITING ROOM (GUEST) -->
    <section id="lobby-panel" class="modal-card" aria-label="Кімната очікування" hidden>
      <div class="lobby-top">
        <div class="code-pill">
          <span>Хост:</span>
          <strong id="lobby-host-name">---</strong>
        </div>
        <span id="lobby-status-text" class="lobby-hint" role="status" aria-live="polite">2–${MAX_ROOM_PLAYERS} гравців</span>
        <button id="btn-leave-room" type="button" class="icon-close-btn" aria-label="Вийти з кімнати" title="Вийти з кімнати">✕</button>
      </div>

      <div id="host-settings" class="compact-settings" hidden>
        <label aria-label="Мапа">
          <span>Мапа</span>
          <select id="setting-map" disabled>
            <option value="meadow-boulders" selected>Галявина</option>
          </select>
        </label>
        <label aria-label="Час на хід">
          <span>Хід</span>
          <select id="setting-turn-sec">
            <option value="25">25с</option>
            <option value="45" selected>45с</option>
            <option value="60">60с</option>
          </select>
        </label>
        <label aria-label="Їжачків у команді">
          <span>Бійці</span>
          <select id="setting-hogs-count">
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3" selected>3</option>
            <option value="4">4</option>
          </select>
        </label>
        <label aria-label="Гранати">
          <span>Гранати</span>
          <select id="setting-grenades">
            <option value="3">3</option>
            <option value="6" selected>6</option>
            <option value="10">10</option>
          </select>
        </label>
      </div>

      <ul id="lobby-players" class="compact-player-list" aria-label="Гравці в кімнаті"></ul>

      <div class="lobby-bottom">
        <button id="btn-cancel-lobby" type="button" class="game-action-btn secondary-action">
          Вийти з очікування
        </button>
        <button id="btn-start-match" type="button" class="game-action-btn start-action" hidden disabled>
          Почати баталію!
        </button>
      </div>
    </section>

    <!-- CENTERED APP DIALOG: RESULTS -->
    <section id="results-panel" class="modal-card" aria-label="Підсумки гри" hidden>
      <h2 id="results-headline" class="modal-title">Підсумки баталії</h2>
      <p id="results-subtitle" class="results-sub"></p>
      <ul id="results-standings" class="compact-player-list"></ul>
      <div class="lobby-bottom">
        <button id="btn-rematch" type="button" class="game-action-btn primary-action">Зіграти ще раз</button>
        <button id="btn-results-leave" type="button" class="game-action-btn secondary-action">Вийти</button>
      </div>
    </section>
  </div>
`;

const unlockAudioOnce = () => {
  sound.setMuted(false);
  sound.unlockFromGesture();
};
window.addEventListener('pointerdown', unlockAudioOnce, { passive: true });
window.addEventListener('keydown', unlockAudioOnce, { passive: true });

// DOM elements
const statusEl = document.querySelector<HTMLElement>('#connection')!;
const playerProfilePill = document.querySelector<HTMLElement>('#player-profile-pill')!;
const lobbyBackdrop = document.querySelector<HTMLElement>('#lobby-backdrop')!;
const menuTopbar = document.querySelector<HTMLElement>('#menu-topbar')!;
const errorBanner = document.querySelector<HTMLElement>('#error-banner')!;
const errorText = document.querySelector<HTMLElement>('#error-text')!;
const btnReloadApp = document.querySelector<HTMLButtonElement>('#btn-reload-app')!;
const pauseBanner = document.querySelector<HTMLElement>('#pause-banner')!;

const matchHud = document.querySelector<HTMLElement>('#match-hud')!;
const activeTurnLabel = document.querySelector<HTMLElement>('#active-turn-label')!;
const btnPassTurn = document.querySelector<HTMLButtonElement>('#btn-pass-turn')!;
const turnTimerLabel = document.querySelector<HTMLElement>('#turn-timer-label')!;
const btnMatchLeave = document.querySelector<HTMLButtonElement>('#btn-match-leave')!;
const btnWeaponCrate = document.querySelector<HTMLButtonElement>('#btn-weapon-crate')!;
const crateWeaponBadge = document.querySelector<HTMLElement>('#crate-weapon-badge')!;
const weaponDrawer = document.querySelector<HTMLElement>('#weapon-drawer')!;
const matchControls = document.querySelector<HTMLElement>('#match-controls')!;

const entryPanel = document.querySelector<HTMLElement>('#entry-panel')!;
const btnCreateRoom = document.querySelector<HTMLButtonElement>('#btn-create-room')!;
const availableRoomsList = document.querySelector<HTMLUListElement>('#available-rooms-list')!;

const lobbyPanel = document.querySelector<HTMLElement>('#lobby-panel')!;
const lobbyHostName = document.querySelector<HTMLElement>('#lobby-host-name')!;
const lobbyStatusText = document.querySelector<HTMLElement>('#lobby-status-text')!;
const lobbyPlayers = document.querySelector<HTMLUListElement>('#lobby-players')!;
const hostSettingsBox = document.querySelector<HTMLElement>('#host-settings')!;
const settingTurnSec = document.querySelector<HTMLSelectElement>('#setting-turn-sec')!;
const settingHogsCount = document.querySelector<HTMLSelectElement>('#setting-hogs-count')!;
const settingGrenades = document.querySelector<HTMLSelectElement>('#setting-grenades')!;
const btnCancelLobby = document.querySelector<HTMLButtonElement>('#btn-cancel-lobby')!;
const btnStartMatch = document.querySelector<HTMLButtonElement>('#btn-start-match')!;
const btnLeaveRoom = document.querySelector<HTMLButtonElement>('#btn-leave-room')!;

const resultsPanel = document.querySelector<HTMLElement>('#results-panel')!;
const resultsHeadline = document.querySelector<HTMLElement>('#results-headline')!;
const resultsSubtitle = document.querySelector<HTMLElement>('#results-subtitle')!;
const resultsStandings = document.querySelector<HTMLUListElement>('#results-standings')!;
const btnRematch = document.querySelector<HTMLButtonElement>('#btn-rematch')!;
const btnResultsLeave = document.querySelector<HTMLButtonElement>('#btn-results-leave')!;

const btnWeaponRocket = document.querySelector<HTMLButtonElement>('#btn-weapon-rocket')!;
const btnWeaponGrenade = document.querySelector<HTMLButtonElement>('#btn-weapon-grenade')!;
const ammoRocketEl = document.querySelector<HTMLElement>('#ammo-rocket')!;
const ammoGrenadeEl = document.querySelector<HTMLElement>('#ammo-grenade')!;
const fuseRow = document.querySelector<HTMLElement>('#fuse-row')!;
const btnJumpLeft = document.querySelector<HTMLButtonElement>('#btn-jump-left')!;
const btnJumpRight = document.querySelector<HTMLButtonElement>('#btn-jump-right')!;

// Client session & game state
let socket: WebSocket | null = null;
let connected = false;
let mySessionId: string | null = null;
let myTeamId: string | null = null;

let availableRooms: PublicRoomSummary[] = [];
let currentRoomCode: string | null = null;
let currentRoomStatus: 'waiting' | 'ready' | 'playing' | 'results' | 'closed' | null = null;
let currentHostSessionId: string | null = null;
let currentPlayers: PublicRoomPlayer[] = [];
let currentSettings: RoomSettings | null = null;

let activeMatchId: string | null = null;
let localWorld: WorldState | null = null;
let nextCommandSeq = 1;

// Local input & multitouch tracking
const heldControls = new Map<number, 'left' | 'right'>();
let currentMoveDir: -1 | 0 | 1 = 0;
let localAimAngleDeg = 20;
let localFacing: -1 | 1 = 1;
let localSelectedWeapon: WeaponKind = 'rocket';
let localGrenadeFuseSec: 1 | 2 | 3 | 4 | 5 = 3;
let currentChargePower: number | null = null;
let lastAimSentAtMs = 0;

// Instantiate full-screen Match Renderer with smooth Angry Birds slingshot callbacks
const { createMatchRenderer } = await import('./renderer');
const renderer = createMatchRenderer('field', {
  onSlingshotAim: (angleDeg, facing, power) => {
    if (!isMyTurnInControl()) return;
    localAimAngleDeg = angleDeg;
    localFacing = facing;
    currentChargePower = power;
    weaponDrawer.hidden = true;
    syncLocalAimFeedback();
    const now = performance.now();
    if (power !== null && now - lastAimSentAtMs >= 65) {
      lastAimSentAtMs = now;
      sendMatchCommand({
        kind: 'aim',
        angleDeg: Number(localAimAngleDeg.toFixed(3)),
        facing: localFacing,
      });
    }
  },
  onSlingshotReleaseFire: (angleDeg, facing, power) => {
    if (!isMyTurnInControl()) return;
    localAimAngleDeg = angleDeg;
    localFacing = facing;
    currentChargePower = null;
    syncLocalAimFeedback();
    sound.play('launch');
    sendMatchCommand({
      kind: 'fire',
      weapon: localSelectedWeapon,
      angleDeg: Number(angleDeg.toFixed(3)),
      facing,
      power: Math.min(1000, Math.max(120, Number(power.toFixed(2)))),
      ...(localSelectedWeapon === 'grenade'
        ? { grenadeFuseSeconds: localGrenadeFuseSec }
        : {}),
    });
  },
});

btnReloadApp.addEventListener('click', () => {
  location.reload();
});

btnWeaponCrate.addEventListener('click', () => {
  weaponDrawer.hidden = !weaponDrawer.hidden;
});

// Top-left circular timer with arrows passes/skips your turn when pressed
btnPassTurn.addEventListener('click', () => {
  if (!isMyTurnInControl()) return;
  sound.play('turn');
  sendMatchCommand({ kind: 'skipTurn' });
});

function sendClientMessage(msg: ClientMessage): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(msg));
}

function sendMatchCommand(action: MatchCommandAction): void {
  if (!activeMatchId || !isMyTurnInControl()) return;
  const seq = nextCommandSeq++;
  sendClientMessage({
    type: 'match.command',
    matchId: activeMatchId,
    commandSeq: seq,
    action,
  });
}

function isMyTurnInControl(): boolean {
  return Boolean(
    currentRoomStatus === 'playing' &&
      localWorld &&
      localWorld.phase === 'control' &&
      myTeamId &&
      localWorld.activeTeamId === myTeamId,
  );
}

function showError(messageUk: string, requiresReload = false): void {
  errorText.textContent = messageUk;
  btnReloadApp.hidden = !requiresReload;
  errorBanner.hidden = false;
  if (!requiresReload) {
    setTimeout(() => {
      if (errorText.textContent === messageUk) {
        errorBanner.hidden = true;
      }
    }, 4500);
  }
}

function refreshProfileBadge(): { name: string; colorIndex: number } {
  const profile = resolvePlayerProfile();
  const preset = TEAM_PRESETS_UK[profile.colorIndex] ?? TEAM_PRESETS_UK[0];
  playerProfilePill.style.setProperty('--team-color', preset.hex);
  playerProfilePill.textContent = `${preset.symbol} ${profile.name}`;
  return profile;
}

btnCreateRoom.addEventListener('click', () => {
  unlockAudioOnce();
  errorBanner.hidden = true;
  const profile = refreshProfileBadge();
  const preset = TEAM_PRESETS_UK[profile.colorIndex] ?? TEAM_PRESETS_UK[0];
  sendClientMessage({
    type: 'room.create',
    teamName: profile.name,
    colorIndex: profile.colorIndex,
    hogNames: [...preset.hogs],
  });
});

function joinAvailableRoom(roomCode: string): void {
  unlockAudioOnce();
  errorBanner.hidden = true;
  const profile = refreshProfileBadge();
  const preset = TEAM_PRESETS_UK[profile.colorIndex] ?? TEAM_PRESETS_UK[0];
  sendClientMessage({
    type: 'room.join',
    roomCode,
    teamName: profile.name,
    colorIndex: profile.colorIndex,
    hogNames: [...preset.hogs],
  });
}

function renderAvailableRoomsList(): void {
  if (availableRooms.length === 0) {
    availableRoomsList.innerHTML = `<li class="empty-rooms-hint">Немає активних кімнат — створи власну!</li>`;
    return;
  }
  availableRoomsList.innerHTML = availableRooms
    .map((room) => {
      const preset = TEAM_PRESETS_UK[room.colorIndex % TEAM_PRESETS_UK.length]!;
      const minLeft = Math.max(1, Math.ceil(room.expiresInSeconds / 60));
      return `
        <li class="room-list-row">
          <button type="button" class="room-join-card" data-room-code="${room.roomCode}" style="--team-color: ${preset.hex}">
            <span class="room-host-title">${preset.symbol} Хост: <strong>${room.hostName}</strong></span>
            <span class="room-meta-pill">${room.playerCount}/${room.maxPlayers} · ${minLeft} хв</span>
          </button>
        </li>
      `;
    })
    .join('');

  availableRoomsList.querySelectorAll<HTMLButtonElement>('.room-join-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.roomCode;
      if (code) joinAvailableRoom(code);
    });
  });
}

btnLeaveRoom.addEventListener('click', () => {
  sendClientMessage({ type: 'room.leave' });
});
btnCancelLobby.addEventListener('click', () => {
  sendClientMessage({ type: 'room.leave' });
});
btnMatchLeave.addEventListener('click', () => {
  sendClientMessage({ type: 'room.leave' });
});
btnResultsLeave.addEventListener('click', () => {
  sendClientMessage({ type: 'room.leave' });
});

btnStartMatch.addEventListener('click', () => {
  unlockAudioOnce();
  sendClientMessage({ type: 'room.start' });
});

btnRematch.addEventListener('click', () => {
  unlockAudioOnce();
  sendClientMessage({ type: 'room.rematch' });
});

function onHostSettingsChange(): void {
  if (currentHostSessionId !== mySessionId) return;
  sendClientMessage({
    type: 'room.configure',
    turnDurationSeconds: Number(settingTurnSec.value),
    charactersPerTeam: Number(settingHogsCount.value),
    grenadeAmmo: Number(settingGrenades.value),
  });
}
settingTurnSec.addEventListener('change', onHostSettingsChange);
settingHogsCount.addEventListener('change', onHostSettingsChange);
settingGrenades.addEventListener('change', onHostSettingsChange);

btnWeaponRocket.addEventListener('click', () => {
  localSelectedWeapon = 'rocket';
  crateWeaponBadge.hidden = true;
  btnWeaponRocket.classList.add('active-weapon');
  btnWeaponGrenade.classList.remove('active-weapon');
  fuseRow.hidden = true;
  weaponDrawer.hidden = true;
  if (isMyTurnInControl()) {
    sendMatchCommand({ kind: 'selectWeapon', weapon: 'rocket' });
  }
});

btnWeaponGrenade.addEventListener('click', () => {
  localSelectedWeapon = 'grenade';
  crateWeaponBadge.hidden = false;
  btnWeaponGrenade.classList.add('active-weapon');
  btnWeaponRocket.classList.remove('active-weapon');
  fuseRow.hidden = false;
  weaponDrawer.hidden = true;
  if (isMyTurnInControl()) {
    sendMatchCommand({
      kind: 'selectWeapon',
      weapon: 'grenade',
      grenadeFuseSeconds: localGrenadeFuseSec,
    });
  }
});

document.querySelectorAll<HTMLButtonElement>('.fuse-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const fuse = Number(btn.dataset.fuse ?? 3) as 1 | 2 | 3 | 4 | 5;
    localGrenadeFuseSec = fuse;
    document.querySelectorAll('.fuse-btn').forEach((b) => b.classList.remove('active-fuse'));
    btn.classList.add('active-fuse');
    if (isMyTurnInControl()) {
      sendMatchCommand({
        kind: 'selectWeapon',
        weapon: 'grenade',
        grenadeFuseSeconds: localGrenadeFuseSec,
      });
    }
  });
});

// Bottom-left top button: Jump Left; Bottom-right top button: Jump Right
btnJumpLeft.addEventListener('click', () => {
  if (!isMyTurnInControl()) return;
  localFacing = -1;
  syncLocalAimFeedback();
  sound.play('jump');
  sendMatchCommand({ kind: 'jump', jumpKind: 'long', facing: -1 });
});

btnJumpRight.addEventListener('click', () => {
  if (!isMyTurnInControl()) return;
  localFacing = 1;
  syncLocalAimFeedback();
  sound.play('jump');
  sendMatchCommand({ kind: 'jump', jumpKind: 'long', facing: 1 });
});

// Independent multitouch hold buttons (Move Left, Move Right)
document.querySelectorAll<HTMLButtonElement>('[data-hold]').forEach((btn) => {
  const holdKind = btn.dataset.hold as 'left' | 'right';

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try {
      btn.setPointerCapture(e.pointerId);
    } catch {
      // ignore synthetic pointer events
    }
    heldControls.set(e.pointerId, holdKind);
    btn.classList.add('pressed');
    syncHeldMovementState();
  });

  const releasePointer = (e: PointerEvent) => {
    if (!heldControls.has(e.pointerId)) return;
    heldControls.delete(e.pointerId);
    btn.classList.remove('pressed');
    syncHeldMovementState();
  };

  btn.addEventListener('pointerup', releasePointer);
  btn.addEventListener('pointercancel', releasePointer);
  btn.addEventListener('lostpointercapture', releasePointer);
});

function syncHeldMovementState(): void {
  const values = Array.from(heldControls.values());
  const leftHeld = values.includes('left');
  const rightHeld = values.includes('right');
  const nextDir: -1 | 0 | 1 = leftHeld && !rightHeld ? -1 : rightHeld && !leftHeld ? 1 : 0;

  if (nextDir !== 0) {
    localFacing = nextDir;
    syncLocalAimFeedback();
  }

  if (nextDir !== currentMoveDir) {
    currentMoveDir = nextDir;
    if (isMyTurnInControl()) {
      sendMatchCommand({ kind: 'move', direction: currentMoveDir });
    }
  }
}

function clearAllHeldInputs(reason: 'blur' | 'visibility' | 'touch_cancel' | 'manual'): void {
  const hadInputs = heldControls.size > 0 || currentMoveDir !== 0 || currentChargePower !== null;
  heldControls.clear();
  document
    .querySelectorAll('.touch-btn.pressed')
    .forEach((el) => el.classList.remove('pressed'));
  currentMoveDir = 0;
  currentChargePower = null;
  syncLocalAimFeedback();

  if (hadInputs && activeMatchId) {
    sendClientMessage({
      type: 'match.release_inputs',
      matchId: activeMatchId,
      reason,
    });
  }
}

window.addEventListener('blur', () => clearAllHeldInputs('blur'));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    clearAllHeldInputs('visibility');
  }
});

function syncLocalAimFeedback(): void {
  if (!localWorld || !isMyTurnInControl() || !localWorld.activeCharacterId) {
    renderer.setLocalAim(null);
    return;
  }
  const feedback: LocalAimFeedback = {
    characterId: localWorld.activeCharacterId,
    angleDeg: localAimAngleDeg,
    facing: localFacing,
    chargePower: currentChargePower,
  };
  renderer.setLocalAim(feedback);
}

function updatePanels(): void {
  const inRoom = currentRoomCode !== null && currentRoomStatus !== 'closed';
  const isPlaying = inRoom && currentRoomStatus === 'playing';
  const isResults = inRoom && currentRoomStatus === 'results';
  const isLobby = inRoom && (currentRoomStatus === 'waiting' || currentRoomStatus === 'ready');

  lobbyBackdrop.hidden = isPlaying;
  menuTopbar.hidden = isPlaying;
  entryPanel.hidden = inRoom;
  lobbyPanel.hidden = !isLobby;
  matchHud.hidden = !isPlaying;
  matchControls.hidden = !isPlaying;
  resultsPanel.hidden = !isResults;

  refreshProfileBadge();

  if (!inRoom) {
    pauseBanner.hidden = true;
    weaponDrawer.hidden = true;
    renderer.setWorldState(null, null);
    renderAvailableRoomsList();
    return;
  }

  if (isLobby) {
    const hostPlayer =
      currentPlayers.find((p) => p.sessionId === currentHostSessionId) ?? currentPlayers[0];
    lobbyHostName.textContent = hostPlayer?.teamName ?? '---';
    const isHost = currentHostSessionId === mySessionId;
    hostSettingsBox.hidden = !isHost;
    btnStartMatch.hidden = !isHost;
    btnStartMatch.disabled = currentRoomStatus !== 'ready';
    btnCancelLobby.textContent = isHost ? 'Скасувати' : 'Вийти з очікування';

    if (currentSettings) {
      settingTurnSec.value = String(currentSettings.turnDurationSeconds);
      settingHogsCount.value = String(currentSettings.charactersPerTeam);
      settingGrenades.value = String(currentSettings.grenadeAmmo);
    }

    const me = currentPlayers.find((p) => p.sessionId === mySessionId);
    myTeamId = me?.teamId ?? null;

    if (currentPlayers.length < 2) {
      lobbyStatusText.textContent = `Чекаємо гравців (1/${MAX_ROOM_PLAYERS})`;
    } else if (isHost) {
      lobbyStatusText.textContent = `Гравців: ${currentPlayers.length}/${MAX_ROOM_PLAYERS} · Готово до старту`;
    } else {
      lobbyStatusText.textContent = `Гравців: ${currentPlayers.length}/${MAX_ROOM_PLAYERS} · Чекаємо старт від хоста…`;
    }

    lobbyPlayers.innerHTML = currentPlayers
      .map((p) => {
        const preset = TEAM_PRESETS_UK[p.colorIndex % TEAM_PRESETS_UK.length]!;
        const isMe = p.sessionId === mySessionId;
        const isHostPlayer = p.sessionId === currentHostSessionId;
        const stateBadge = !p.connected ? '⚡' : '✓';
        return `
          <li class="player-slot" style="--team-color: ${preset.hex}">
            <span class="team-badge">${preset.symbol} ${p.teamName}${isMe ? ' (Ти)' : ''}${isHostPlayer ? ' ★' : ''}</span>
            <span class="ready-badge is-ready">${stateBadge}</span>
          </li>
        `;
      })
      .join('');
  }

  if (isPlaying && localWorld) {
    const me = currentPlayers.find((p) => p.sessionId === mySessionId);
    myTeamId = me?.teamId ?? myTeamId;

    const activeTeam = localWorld.teams.find((t) => t.id === localWorld!.activeTeamId);
    const activePreset = activeTeam
      ? TEAM_PRESETS_UK[activeTeam.colorIndex % TEAM_PRESETS_UK.length]!
      : TEAM_PRESETS_UK[0];

    const myTurn = isMyTurnInControl();
    if (localWorld.phase !== 'control') {
      activeTurnLabel.textContent = 'Постріл';
    } else if (myTurn) {
      activeTurnLabel.textContent = `Твій хід ${activePreset.symbol}`;
    } else {
      activeTurnLabel.textContent = `${activePreset.symbol} ${activeTeam?.name ?? ''}`;
    }
    activeTurnLabel.classList.toggle('my-turn-chip', myTurn);

    const secLeft = Math.max(0, Math.ceil(localWorld.turnTicksRemaining / TICKS_PER_SECOND));
    turnTimerLabel.textContent = String(secLeft);
    btnPassTurn.disabled = !myTurn;

    const myTeamState = localWorld.teams.find((t) => t.id === myTeamId);
    if (myTeamState) {
      ammoRocketEl.textContent = String(myTeamState.inventory.rocket);
      ammoGrenadeEl.textContent = String(myTeamState.inventory.grenade);
      crateWeaponBadge.textContent = String(myTeamState.inventory.grenade);
    }

    fuseRow.hidden = localSelectedWeapon !== 'grenade';
    matchControls.classList.toggle('controls-disabled', !myTurn);
  }
}

function renderResultsSummary(results: MatchResultsSummary): void {
  resultsHeadline.textContent = results.headlineUk;
  resultsSubtitle.textContent = results.subtitleUk;
  resultsStandings.innerHTML = results.standings
    .map((entry, idx) => {
      const preset = TEAM_PRESETS_UK[entry.colorIndex % TEAM_PRESETS_UK.length]!;
      return `
        <li class="player-slot" style="--team-color: ${preset.hex}">
          <span class="team-badge">${idx + 1}. ${preset.symbol} ${entry.teamName}</span>
          <span class="ready-badge">Бійці: ${entry.survivingHogs} · ♥ ${entry.totalHealth}</span>
        </li>
      `;
    })
    .join('');
}

let pingInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let lastObservedActiveCharId: string | null = null;

function connectWebSocket(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
  const ws = new WebSocket(wsUrl);
  socket = ws;
  connected = false;

  const helloWatchdog = setTimeout(() => {
    if (!connected) {
      statusEl.textContent = 'Немає зв’язку';
      ws.close();
    }
  }, 6500);

  ws.addEventListener('open', () => {
    let savedToken: string | undefined;
    try {
      savedToken = sessionStorage.getItem(RESUME_TOKEN_STORAGE_KEY) ?? undefined;
    } catch {
      savedToken = undefined;
    }
    sendClientMessage({
      type: 'client.hello',
      protocolVersion: PROTOCOL_VERSION,
      rulesVersion: RULES_VERSION,
      contentHash: CONTENT_HASH,
      gameId: 'hedge-wars',
      ...(savedToken ? { resumeToken: savedToken } : {}),
    });
  });

  ws.addEventListener('message', (event: MessageEvent<string>) => {
    try {
      const parsed = ServerMessage.safeParse(JSON.parse(event.data));
      if (!parsed.success) return;
      clearTimeout(helloWatchdog);
      handleServerMessage(parsed.data);
    } catch {
      statusEl.textContent = 'Помилка зв’язку';
    }
  });

  ws.addEventListener('close', () => {
    clearTimeout(helloWatchdog);
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    if (connected) {
      statusEl.textContent = 'Повертаємося…';
      reconnectTimeout = setTimeout(() => connectWebSocket(), 1500);
    }
  });

  ws.addEventListener('error', () => {
    clearTimeout(helloWatchdog);
    statusEl.textContent = 'Офлайн';
  });
}

function handleServerMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case 'server.hello': {
      connected = true;
      mySessionId = msg.sessionId;
      try {
        sessionStorage.setItem(RESUME_TOKEN_STORAGE_KEY, msg.resumeToken);
      } catch {
        // ignore
      }
      statusEl.textContent = 'Онлайн';
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        sendClientMessage({ type: 'client.ping', clientTimeMs: Date.now() });
      }, 4000);
      sendClientMessage({ type: 'client.ping', clientTimeMs: Date.now() });
      sendClientMessage({ type: 'room.list' });
      break;
    }

    case 'rooms.list': {
      availableRooms = msg.rooms;
      renderAvailableRoomsList();
      break;
    }

    case 'server.pong': {
      const rtt = Math.max(1, Date.now() - msg.clientTimeMs);
      statusEl.textContent = `${rtt} мс`;
      break;
    }

    case 'server.error': {
      if (
        msg.code === 'PROTOCOL_MISMATCH' ||
        msg.code === 'RULES_MISMATCH' ||
        msg.code === 'CONTENT_MISMATCH'
      ) {
        statusEl.textContent = 'Онови гру';
      }
      showError(msg.messageUk, Boolean(msg.requiresReload));
      break;
    }

    case 'room.state': {
      currentRoomCode = msg.roomCode;
      currentRoomStatus = msg.status;
      currentHostSessionId = msg.hostSessionId;
      currentPlayers = msg.players;
      currentSettings = msg.settings;
      activeMatchId = msg.activeMatchId;
      pauseBanner.hidden = !msg.pausedForDisconnect;
      if (msg.lastResults && msg.status === 'results') {
        renderResultsSummary(msg.lastResults);
      }
      updatePanels();
      break;
    }

    case 'room.left': {
      currentRoomCode = null;
      currentRoomStatus = null;
      currentHostSessionId = null;
      currentPlayers = [];
      activeMatchId = null;
      localWorld = null;
      if (msg.reason === 'expired') {
        showError('Кімнату закрито через неактивність.');
      }
      sendClientMessage({ type: 'room.list' });
      updatePanels();
      break;
    }

    case 'match.snapshot': {
      activeMatchId = msg.matchId;
      localWorld = deserializeWorldState(msg.world);
      const myAck = myTeamId ? (msg.lastAckSeqByTeam[myTeamId] ?? 0) : 0;
      nextCommandSeq = Math.max(nextCommandSeq, myAck + 1);

      const activeChar = localWorld.characters.find(
        (c) => c.id === localWorld!.activeCharacterId,
      );
      if (activeChar) {
        localAimAngleDeg = activeChar.aimAngleDeg;
        localFacing = activeChar.facing;
        lastObservedActiveCharId = activeChar.id;
      }

      renderer.refreshFullTerrain(localWorld.terrain);
      renderer.setWorldState(localWorld, null);
      renderer.focusActiveEntity(true);
      syncLocalAimFeedback();
      updatePanels();
      break;
    }

    case 'match.state': {
      if (!currentRoomCode || currentRoomStatus !== 'playing') {
        return;
      }
      if (!localWorld || msg.matchId !== activeMatchId) {
        sendClientMessage({
          type: 'match.request_snapshot',
          matchId: msg.matchId,
          reason: 'join',
        });
        return;
      }

      for (const edit of msg.terrainEdits) {
        if (edit.previousRevision !== localWorld.terrain.revision) {
          sendClientMessage({
            type: 'match.request_snapshot',
            matchId: msg.matchId,
            knownTerrainRevision: localWorld.terrain.revision,
            reason: 'revision_gap',
          });
          return;
        }
        carveCrater(localWorld.terrain, edit.x, edit.y, edit.radius);
        renderer.applyCraterEdit(localWorld.terrain, edit.x, edit.y, edit.radius);
      }

      if (
        localWorld.terrain.revision !== msg.terrainRevision ||
        localWorld.terrain.checksum !== msg.terrainChecksum
      ) {
        sendClientMessage({
          type: 'match.request_snapshot',
          matchId: msg.matchId,
          knownTerrainRevision: localWorld.terrain.revision,
          reason: 'checksum_mismatch',
        });
        return;
      }

      localWorld.tick = msg.tick;
      localWorld.wind = msg.wind;
      localWorld.turnTicksRemaining = msg.turnTicksRemaining;
      localWorld.phase = msg.phase;
      localWorld.activeTeamId = msg.activeTeamId;
      localWorld.activeCharacterId = msg.activeCharacterId;
      localWorld.teams = msg.teams;
      localWorld.characters = msg.characters;
      localWorld.projectiles = msg.projectiles;

      const switchedTurnChar =
        Boolean(msg.activeCharacterId) && msg.activeCharacterId !== lastObservedActiveCharId;
      if (switchedTurnChar && msg.activeCharacterId) {
        lastObservedActiveCharId = msg.activeCharacterId;
        const activeChar = localWorld.characters.find((c) => c.id === msg.activeCharacterId);
        if (activeChar) {
          localAimAngleDeg = activeChar.aimAngleDeg;
          localFacing = activeChar.facing;
        }
        currentChargePower = null;
        sound.play('turn');
      }

      for (const ev of msg.events) {
        if (ev.type === 'explosion') sound.play('explosion');
        else if (ev.type === 'projectile.bounced') sound.play('bounce');
        else if (ev.type === 'character.drowned') sound.play('splash');
      }

      renderer.triggerEvents(msg.events);
      renderer.setWorldState(
        localWorld,
        isMyTurnInControl() && localWorld.activeCharacterId
          ? {
              characterId: localWorld.activeCharacterId,
              angleDeg: localAimAngleDeg,
              facing: localFacing,
              chargePower: currentChargePower,
            }
          : null,
      );
      if (switchedTurnChar) {
        renderer.focusActiveEntity(false);
      }
      updatePanels();
      break;
    }

    case 'match.results': {
      renderResultsSummary(msg.results);
      updatePanels();
      break;
    }

    case 'match.command_ack':
      break;
  }
}

connectWebSocket();

(window as unknown as Record<string, unknown>).__hedgeDebug = {
  getRoomCode: () => currentRoomCode,
  getRoomStatus: () => currentRoomStatus,
  getMatchId: () => activeMatchId,
  getMyTeamId: () => myTeamId,
  getActiveTeamId: () => localWorld?.activeTeamId ?? null,
  getTurnPhase: () => localWorld?.phase ?? null,
  getTerrainRevision: () => localWorld?.terrain.revision ?? null,
  getTerrainChecksum: () => localWorld?.terrain.checksum ?? null,
  getWorldChecksum: () => (localWorld ? computeWorldChecksum(localWorld) : null),
  getDirtyChunkUpdates: () => renderer.getDirtyChunkUpdateCount(),
  getCameraZoom: () => renderer.getCameraZoom(),
  getActiveCharacterScreenPoint: () => renderer.getActiveCharacterScreenPoint(),
};

window.addEventListener(
  'pagehide',
  () => {
    if (pingInterval) clearInterval(pingInterval);
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    socket?.close();
    renderer.destroy();
  },
  { once: true },
);
