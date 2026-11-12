import {
  CONTENT_HASH,
  PROTOCOL_VERSION,
  RULES_VERSION,
  ServerMessage,
  TEAM_PRESETS_UK,
  type ClientMessage,
  type MatchCommandAction,
  type MatchResultsSummary,
  type PublicRoomPlayer,
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
import { registerPwa } from '../../../platform/pwa';
import { SoundController } from './audio';
import type { LocalAimFeedback } from './renderer';
import './style.css';

registerPwa();

const RESUME_TOKEN_STORAGE_KEY = 'yizhaklub.hedge.resumeToken';
const sound = new SoundController();

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="game-viewport">
    <!-- Full-screen game canvas -->
    <div id="field" class="field-canvas" role="img" aria-label="Сонячна галявина їжачків. Ігрове поле баталій."></div>

    <!-- Floating Corner Top Bar (visible in menus/lobby) -->
    <header id="menu-topbar" class="menu-topbar">
      <a class="corner-pill back" href="/" aria-label="До ігор">← До ігор</a>
      <div class="corner-right-group">
        <span id="connection" class="status-dot" role="status" aria-live="polite" title="З’єднання з сервером">Онлайн</span>
        <button id="btn-mute" type="button" class="square-icon-btn" aria-label="Перемкнути звук">
          ${sound.isMuted() ? '✕' : '♪'}
        </button>
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

    <!-- IN-MATCH FLOATING HUD (Modeled directly on gameplay ui sample.jpg) -->
    <section id="match-hud" class="match-hud-overlay" aria-label="Стан бою" hidden>
      <!-- Top-Left: Circular Timer + Square Action Buttons -->
      <div class="hud-top-left">
        <div class="timer-circle" role="status" aria-live="polite" title="Час ходу">
          <svg viewBox="0 0 64 64" aria-hidden="true" class="timer-svg">
            <path d="M16 14 A24 24 0 1 1 10 38" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
            <polygon points="16,7 22,16 11,17" fill="currentColor"/>
            <path d="M48 50 A24 24 0 0 1 16 50" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
            <polygon points="48,57 42,48 53,47" fill="currentColor"/>
          </svg>
          <span id="turn-timer-label" class="timer-number">45</span>
        </div>

        <button id="btn-camera-toggle" type="button" class="square-icon-btn" aria-label="Огляд мапи" title="Огляд мапи">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        </button>

        <button id="btn-match-leave" type="button" class="square-icon-btn" aria-label="Вийти з бою" title="Вийти з бою">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>

      <!-- Top-Right: Weapon Crate Button + Popover Drawer -->
      <div class="hud-top-right">
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

        <div id="weapon-drawer" class="weapon-drawer" hidden>
          <div class="drawer-meta-row">
            <span id="active-turn-label" class="turn-chip">Твій хід</span>
            <span id="wind-label" class="wind-chip" title="Вітер">Вітер 0%</span>
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
          <div id="fuse-row" class="fuse-row" hidden>
            <button type="button" class="fuse-btn" data-fuse="1">1с</button>
            <button type="button" class="fuse-btn" data-fuse="2">2с</button>
            <button type="button" class="fuse-btn active-fuse" data-fuse="3">3с</button>
            <button type="button" class="fuse-btn" data-fuse="4">4с</button>
            <button type="button" class="fuse-btn" data-fuse="5">5с</button>
          </div>
          <div class="fuse-row">
            <button id="btn-aim-up" type="button" class="touch-btn fuse-btn" data-hold="aim-up" aria-label="Приціл вище">Приціл ▲</button>
            <button id="btn-aim-down" type="button" class="touch-btn fuse-btn" data-hold="aim-down" aria-label="Приціл нижче">Приціл ▼</button>
            <button id="btn-jump-high" type="button" class="touch-btn fuse-btn" aria-label="Високе сальто">Сальто ↑</button>
          </div>
        </div>
      </div>
    </section>

    <!-- IN-MATCH MULTITOUCH THUMB CIRCLES (Bottom-Left & Bottom-Right like gameplay ui sample.jpg) -->
    <section id="match-controls" class="match-thumb-controls" aria-label="Керування їжачком" hidden>
      <!-- Bottom-Left: 2 stacked circular buttons (Jump above Move Left) -->
      <div class="thumb-column thumb-left">
        <button id="btn-jump-long" type="button" class="touch-btn circle-control-btn" aria-label="Стрибок уперед">
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

      <!-- Bottom-Right: 2 stacked circular buttons (Fire/Launch above Move Right) -->
      <div class="thumb-column thumb-right">
        <button id="btn-fire" type="button" class="touch-btn circle-control-btn fire-circle-btn" aria-label="Постріл. Утримуй для сили">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <polygon points="52,16 14,30 28,36 36,50" fill="currentColor"/>
          </svg>
          <div class="charge-bar-mini" aria-hidden="true"><div id="charge-fill" class="charge-fill"></div></div>
        </button>

        <button id="btn-move-right" type="button" class="touch-btn circle-control-btn" data-hold="right" aria-label="Рух праворуч">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <polygon points="54,32 30,16 30,48" fill="currentColor"/>
            <circle cx="22" cy="32" r="10" fill="currentColor"/>
          </svg>
        </button>
      </div>
    </section>

    <!-- CENTERED APP DIALOG: ENTRY (Create / Join Room) -->
    <section id="entry-panel" class="modal-card" aria-label="Кімнати для гри">
      <h1 class="modal-title">Їжачі баталії</h1>

      <div class="team-setup-strip">
        <input id="team-name-input" type="text" maxlength="24" value="Колючі мандрівники" aria-label="Назва загону" />
        <div class="color-picker" role="group" aria-label="Колір команди">
          ${TEAM_PRESETS_UK.map(
            (preset, idx) => `
            <button type="button" class="color-dot ${idx === 0 ? 'selected-chip' : ''}" data-color="${idx}" style="--chip-color: ${preset.hex}" aria-label="${preset.name}">
              ${preset.symbol}
            </button>
          `,
          ).join('')}
        </div>
      </div>

      <div class="modal-split">
        <button id="btn-create-room" type="button" class="game-action-btn primary-action">
          Створити кімнату
        </button>

        <div class="join-inline">
          <input id="room-code-input" type="text" maxlength="8" placeholder="Код" aria-label="Код кімнати" autocomplete="off" />
          <button id="btn-join-room" type="button" class="game-action-btn secondary-action">
            Увійти
          </button>
        </div>
      </div>
    </section>

    <!-- CENTERED APP DIALOG: WAITING ROOM LOBBY -->
    <section id="lobby-panel" class="modal-card" aria-label="Кімната очікування" hidden>
      <div class="lobby-top">
        <div class="code-pill">
          <span>Код:</span>
          <strong id="lobby-room-code">----</strong>
        </div>
        <span id="lobby-status-text" class="lobby-hint" role="status" aria-live="polite">2–4 гравці</span>
        <button id="btn-leave-room" type="button" class="icon-close-btn" aria-label="Вийти з кімнати">✕</button>
      </div>

      <ul id="lobby-players" class="compact-player-list" aria-label="Гравці в кімнаті"></ul>

      <div id="host-settings" class="compact-settings" hidden>
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

      <div class="lobby-bottom">
        <button id="btn-ready" type="button" class="game-action-btn primary-action">Готовий до бою!</button>
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
  sound.unlockFromGesture();
};
window.addEventListener('pointerdown', unlockAudioOnce, { passive: true });
window.addEventListener('keydown', unlockAudioOnce, { passive: true });

// DOM elements
const statusEl = document.querySelector<HTMLElement>('#connection')!;
const menuTopbar = document.querySelector<HTMLElement>('#menu-topbar')!;
const btnMute = document.querySelector<HTMLButtonElement>('#btn-mute')!;
const errorBanner = document.querySelector<HTMLElement>('#error-banner')!;
const errorText = document.querySelector<HTMLElement>('#error-text')!;
const btnReloadApp = document.querySelector<HTMLButtonElement>('#btn-reload-app')!;
const pauseBanner = document.querySelector<HTMLElement>('#pause-banner')!;

const matchHud = document.querySelector<HTMLElement>('#match-hud')!;
const activeTurnLabel = document.querySelector<HTMLElement>('#active-turn-label')!;
const turnTimerLabel = document.querySelector<HTMLElement>('#turn-timer-label')!;
const windLabel = document.querySelector<HTMLElement>('#wind-label')!;
const btnCameraToggle = document.querySelector<HTMLButtonElement>('#btn-camera-toggle')!;
const btnMatchLeave = document.querySelector<HTMLButtonElement>('#btn-match-leave')!;
const btnWeaponCrate = document.querySelector<HTMLButtonElement>('#btn-weapon-crate')!;
const crateWeaponBadge = document.querySelector<HTMLElement>('#crate-weapon-badge')!;
const weaponDrawer = document.querySelector<HTMLElement>('#weapon-drawer')!;
const matchControls = document.querySelector<HTMLElement>('#match-controls')!;

const entryPanel = document.querySelector<HTMLElement>('#entry-panel')!;
const teamNameInput = document.querySelector<HTMLInputElement>('#team-name-input')!;
const roomCodeInput = document.querySelector<HTMLInputElement>('#room-code-input')!;
const btnCreateRoom = document.querySelector<HTMLButtonElement>('#btn-create-room')!;
const btnJoinRoom = document.querySelector<HTMLButtonElement>('#btn-join-room')!;

const lobbyPanel = document.querySelector<HTMLElement>('#lobby-panel')!;
const lobbyRoomCode = document.querySelector<HTMLElement>('#lobby-room-code')!;
const lobbyStatusText = document.querySelector<HTMLElement>('#lobby-status-text')!;
const lobbyPlayers = document.querySelector<HTMLUListElement>('#lobby-players')!;
const hostSettingsBox = document.querySelector<HTMLElement>('#host-settings')!;
const settingTurnSec = document.querySelector<HTMLSelectElement>('#setting-turn-sec')!;
const settingHogsCount = document.querySelector<HTMLSelectElement>('#setting-hogs-count')!;
const settingGrenades = document.querySelector<HTMLSelectElement>('#setting-grenades')!;
const btnReady = document.querySelector<HTMLButtonElement>('#btn-ready')!;
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
const btnJumpLong = document.querySelector<HTMLButtonElement>('#btn-jump-long')!;
const btnJumpHigh = document.querySelector<HTMLButtonElement>('#btn-jump-high')!;
const btnFire = document.querySelector<HTMLButtonElement>('#btn-fire')!;
const chargeFill = document.querySelector<HTMLElement>('#charge-fill')!;

// Client session & game state
let socket: WebSocket | null = null;
let connected = false;
let mySessionId: string | null = null;
let myTeamId: string | null = null;
let selectedColorIndex = 0;

let currentRoomCode: string | null = null;
let currentRoomStatus: 'waiting' | 'ready' | 'playing' | 'results' | 'closed' | null = null;
let currentHostSessionId: string | null = null;
let currentPlayers: PublicRoomPlayer[] = [];
let currentSettings: RoomSettings | null = null;

let activeMatchId: string | null = null;
let localWorld: WorldState | null = null;
let nextCommandSeq = 1;

// Local input & multitouch tracking
const heldControls = new Map<number, 'left' | 'right' | 'aim-up' | 'aim-down'>();
let currentMoveDir: -1 | 0 | 1 = 0;
let localAimAngleDeg = 20;
let localFacing: -1 | 1 = 1;
let localSelectedWeapon: WeaponKind = 'rocket';
let localGrenadeFuseSec: 1 | 2 | 3 | 4 | 5 = 3;
let fireChargeStartMs: number | null = null;
let fireChargePointerId: number | null = null;
let currentChargePower: number | null = null;

// Instantiate full-screen Match Renderer
const { createMatchRenderer } = await import('./renderer');
const renderer = createMatchRenderer('field', {
  onCanvasAimChange: (angleDeg, facing) => {
    if (!isMyTurnInControl()) return;
    localAimAngleDeg = angleDeg;
    localFacing = facing;
    syncLocalAimFeedback();
    const now = performance.now();
    if (now - lastAimSentAtMs >= 80) {
      lastAimSentDeg = localAimAngleDeg;
      lastAimSentAtMs = now;
      sendMatchCommand({
        kind: 'aim',
        angleDeg: Math.round(localAimAngleDeg),
        facing: localFacing,
      });
    }
  },
});

btnMute.addEventListener('click', () => {
  const muted = sound.toggleMute();
  btnMute.textContent = muted ? '✕' : '♪';
});

btnReloadApp.addEventListener('click', () => {
  location.reload();
});

btnWeaponCrate.addEventListener('click', () => {
  weaponDrawer.hidden = !weaponDrawer.hidden;
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

document.querySelectorAll<HTMLButtonElement>('.color-dot').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.color-dot').forEach((c) => c.classList.remove('selected-chip'));
    chip.classList.add('selected-chip');
    selectedColorIndex = Number(chip.dataset.color ?? 0);
    const preset = TEAM_PRESETS_UK[selectedColorIndex] ?? TEAM_PRESETS_UK[0];
    if (
      TEAM_PRESETS_UK.some((p) => p.name === teamNameInput.value.trim()) ||
      !teamNameInput.value.trim()
    ) {
      teamNameInput.value = preset.name;
    }
  });
});

btnCreateRoom.addEventListener('click', () => {
  errorBanner.hidden = true;
  const preset = TEAM_PRESETS_UK[selectedColorIndex] ?? TEAM_PRESETS_UK[0];
  sendClientMessage({
    type: 'room.create',
    teamName: teamNameInput.value.trim() || preset.name,
    colorIndex: selectedColorIndex,
    hogNames: [...preset.hogs],
  });
});

btnJoinRoom.addEventListener('click', () => {
  errorBanner.hidden = true;
  const code = roomCodeInput.value.trim().toUpperCase();
  if (code.length < 4) {
    showError('Введи 4 символи коду кімнати.');
    return;
  }
  const preset = TEAM_PRESETS_UK[selectedColorIndex] ?? TEAM_PRESETS_UK[0];
  sendClientMessage({
    type: 'room.join',
    roomCode: code,
    teamName: teamNameInput.value.trim() || preset.name,
    colorIndex: selectedColorIndex,
    hogNames: [...preset.hogs],
  });
});

btnLeaveRoom.addEventListener('click', () => {
  sendClientMessage({ type: 'room.leave' });
});
btnMatchLeave.addEventListener('click', () => {
  sendClientMessage({ type: 'room.leave' });
});
btnResultsLeave.addEventListener('click', () => {
  sendClientMessage({ type: 'room.leave' });
});

btnReady.addEventListener('click', () => {
  const me = currentPlayers.find((p) => p.sessionId === mySessionId);
  if (!me) return;
  sendClientMessage({ type: 'room.ready', ready: !me.ready });
});

btnStartMatch.addEventListener('click', () => {
  sendClientMessage({ type: 'room.start' });
});

btnRematch.addEventListener('click', () => {
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

btnCameraToggle.addEventListener('click', () => {
  renderer.toggleOverview();
});

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
    weaponDrawer.hidden = true;
    if (isMyTurnInControl()) {
      sendMatchCommand({
        kind: 'selectWeapon',
        weapon: 'grenade',
        grenadeFuseSeconds: localGrenadeFuseSec,
      });
    }
  });
});

btnJumpLong.addEventListener('click', () => {
  if (!isMyTurnInControl()) return;
  sound.play('jump');
  sendMatchCommand({ kind: 'jump', jumpKind: 'long' });
});

btnJumpHigh.addEventListener('click', () => {
  if (!isMyTurnInControl()) return;
  sound.play('jump');
  sendMatchCommand({ kind: 'jump', jumpKind: 'high' });
});

// Independent multitouch hold buttons (left, right, aim-up, aim-down)
document.querySelectorAll<HTMLButtonElement>('[data-hold]').forEach((btn) => {
  const holdKind = btn.dataset.hold as 'left' | 'right' | 'aim-up' | 'aim-down';

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

// Fire button: hold to charge power, release to fire (or quick tap)
btnFire.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (!isMyTurnInControl()) return;
  try {
    btnFire.setPointerCapture(e.pointerId);
  } catch {
    // ignore
  }
  fireChargePointerId = e.pointerId;
  fireChargeStartMs = performance.now();
  currentChargePower = 150;
  btnFire.classList.add('pressed');
  weaponDrawer.hidden = true;
  syncLocalAimFeedback();
});

function finishFireCharge(e: PointerEvent, cancelled: boolean): void {
  if (fireChargePointerId !== e.pointerId || fireChargeStartMs === null) return;
  const elapsedMs = performance.now() - fireChargeStartMs;
  fireChargePointerId = null;
  fireChargeStartMs = null;
  btnFire.classList.remove('pressed');
  chargeFill.style.width = '0%';

  if (cancelled || !isMyTurnInControl()) {
    currentChargePower = null;
    syncLocalAimFeedback();
    return;
  }

  const power =
    elapsedMs < 140
      ? 520
      : Math.min(1000, Math.max(120, Math.round(120 + (elapsedMs / 1350) * 880)));
  currentChargePower = null;
  syncLocalAimFeedback();

  sound.play('launch');
  sendMatchCommand({
    kind: 'fire',
    weapon: localSelectedWeapon,
    angleDeg: Math.round(localAimAngleDeg),
    facing: localFacing,
    power,
    ...(localSelectedWeapon === 'grenade'
      ? { grenadeFuseSeconds: localGrenadeFuseSec }
      : {}),
  });
}

btnFire.addEventListener('pointerup', (e) => finishFireCharge(e, false));
btnFire.addEventListener('pointercancel', (e) => finishFireCharge(e, true));

function clearAllHeldInputs(reason: 'blur' | 'visibility' | 'touch_cancel' | 'manual'): void {
  const hadInputs =
    heldControls.size > 0 || currentMoveDir !== 0 || fireChargeStartMs !== null;
  heldControls.clear();
  document
    .querySelectorAll('.touch-btn.pressed')
    .forEach((el) => el.classList.remove('pressed'));
  currentMoveDir = 0;
  fireChargePointerId = null;
  fireChargeStartMs = null;
  currentChargePower = null;
  chargeFill.style.width = '0%';
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

let lastAimSentDeg = localAimAngleDeg;
let lastAimSentAtMs = 0;

setInterval(() => {
  if (!isMyTurnInControl()) return;
  const values = Array.from(heldControls.values());
  let aimChanged = false;
  if (values.includes('aim-up')) {
    localAimAngleDeg = Math.min(85, localAimAngleDeg + 1.8);
    aimChanged = true;
  }
  if (values.includes('aim-down')) {
    localAimAngleDeg = Math.max(-80, localAimAngleDeg - 1.8);
    aimChanged = true;
  }

  if (fireChargeStartMs !== null) {
    const elapsed = performance.now() - fireChargeStartMs;
    currentChargePower = Math.min(1000, Math.round(120 + (elapsed / 1350) * 880));
    chargeFill.style.width = `${Math.round((currentChargePower / 1000) * 100)}%`;
    aimChanged = true;
  }

  if (aimChanged) {
    syncLocalAimFeedback();
    const now = performance.now();
    if (Math.abs(localAimAngleDeg - lastAimSentDeg) >= 3 && now - lastAimSentAtMs >= 90) {
      lastAimSentDeg = localAimAngleDeg;
      lastAimSentAtMs = now;
      sendMatchCommand({
        kind: 'aim',
        angleDeg: Math.round(localAimAngleDeg),
        facing: localFacing,
      });
    }
  }
}, 25);

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

  menuTopbar.hidden = isPlaying;
  entryPanel.hidden = inRoom;
  lobbyPanel.hidden = !isLobby;
  matchHud.hidden = !isPlaying;
  matchControls.hidden = !isPlaying;
  resultsPanel.hidden = !isResults;

  if (!inRoom) {
    pauseBanner.hidden = true;
    weaponDrawer.hidden = true;
    renderer.setWorldState(null, null);
    return;
  }

  if (isLobby) {
    lobbyRoomCode.textContent = currentRoomCode!;
    const isHost = currentHostSessionId === mySessionId;
    hostSettingsBox.hidden = !isHost;
    btnStartMatch.hidden = !isHost;
    btnStartMatch.disabled = currentRoomStatus !== 'ready';

    if (currentSettings) {
      settingTurnSec.value = String(currentSettings.turnDurationSeconds);
      settingHogsCount.value = String(currentSettings.charactersPerTeam);
      settingGrenades.value = String(currentSettings.grenadeAmmo);
    }

    const me = currentPlayers.find((p) => p.sessionId === mySessionId);
    myTeamId = me?.teamId ?? null;
    if (me) {
      btnReady.textContent = me.ready ? '✓ Готовий' : 'Готовий до бою!';
      btnReady.classList.toggle('ready-active', me.ready);
    }

    if (currentPlayers.length < 2) {
      lobbyStatusText.textContent = 'Чекаємо 2–4 гравців';
    } else if (currentRoomStatus === 'ready') {
      lobbyStatusText.textContent = isHost ? 'Усі готові!' : 'Чекаємо старт…';
    } else {
      lobbyStatusText.textContent = 'Натисни «Готовий»';
    }

    lobbyPlayers.innerHTML = currentPlayers
      .map((p) => {
        const preset = TEAM_PRESETS_UK[p.colorIndex % TEAM_PRESETS_UK.length]!;
        const isMe = p.sessionId === mySessionId;
        const isHostPlayer = p.sessionId === currentHostSessionId;
        const stateBadge = !p.connected ? '⚡' : p.ready ? '✓' : '…';
        return `
          <li class="player-slot" style="--team-color: ${preset.hex}">
            <span class="team-badge">${preset.symbol} ${p.teamName}${isMe ? ' (Ти)' : ''}${isHostPlayer ? ' ★' : ''}</span>
            <span class="ready-badge ${p.ready ? 'is-ready' : ''}">${stateBadge}</span>
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

    const windPct = Math.round((localWorld.wind / 0.069444) * 100);
    const windDir = windPct > 5 ? '▶' : windPct < -5 ? '◀' : '•';
    windLabel.textContent = `Вітер ${windDir}${Math.abs(windPct)}%`;

    const myTeamState = localWorld.teams.find((t) => t.id === myTeamId);
    if (myTeamState) {
      ammoRocketEl.textContent = String(myTeamState.inventory.rocket);
      ammoGrenadeEl.textContent = String(myTeamState.inventory.grenade);
      crateWeaponBadge.textContent = String(myTeamState.inventory.grenade);
    }

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
      renderer.focusActiveEntity();
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

      if (msg.activeCharacterId && msg.activeCharacterId !== lastObservedActiveCharId) {
        lastObservedActiveCharId = msg.activeCharacterId;
        const activeChar = localWorld.characters.find((c) => c.id === msg.activeCharacterId);
        if (activeChar) {
          localAimAngleDeg = activeChar.aimAngleDeg;
          localFacing = activeChar.facing;
        }
        sound.play('turn');
        renderer.focusActiveEntity();
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
