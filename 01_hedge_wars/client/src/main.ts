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
  <header class="game-header">
    <a class="back" href="/">← До ігор</a>
    <span class="club-name">Наші ігри</span>
    <div class="header-tools">
      <span id="rtt-badge" class="rtt-badge" hidden>Зв’язок: -- мс</span>
      <button id="btn-mute" type="button" class="tool-btn" aria-label="Перемкнути звук">
        ${sound.isMuted() ? '🔇 Без звуку' : '🔊 Звук'}
      </button>
    </div>
  </header>

  <main class="workshop">
    <section id="hero-intro" class="hero-intro">
      <span class="eyebrow">ДРУЖНІ ПРИГОДИ НА ОСТРОВІ</span>
      <h1>Їжачі баталії</h1>
      <p id="connection" class="connection" role="status" aria-live="polite">Вітаємося з майстернею…</p>
    </section>

    <div id="error-banner" class="error-banner" role="alert" hidden>
      <span id="error-text"></span>
      <button id="btn-reload-app" type="button" class="secondary-btn" hidden>Оновити сторінку</button>
    </div>

    <div id="pause-banner" class="pause-banner" role="status" aria-live="polite" hidden>
      Зв’язок з одним із гравців тимчасово перервався. Чекаємо на повернення до гри…
    </div>

    <!-- Active Match HUD -->
    <section id="match-hud" class="match-hud" aria-label="Стан бою" hidden>
      <div class="hud-top">
        <span id="active-turn-label" class="turn-pill" role="status" aria-live="polite">Підготовка ходу…</span>
        <span id="turn-timer-label" class="timer-pill">⏱ 45 с</span>
        <span id="wind-label" class="wind-pill">🍃 Вітер: 0</span>
        <button id="btn-camera-toggle" type="button" class="tool-btn">🔍 Вся мапа</button>
        <button id="btn-match-leave" type="button" class="tool-btn danger-text">Вийти</button>
      </div>
      <div id="team-health-strip" class="team-health-strip"></div>
    </section>

    <!-- Game Canvas Frame -->
    <div class="field-frame">
      <div id="field" role="img" aria-label="Сонячна галявина їжачків. Ігрове поле баталій."></div>
      <span id="field-label" class="field-label">Сонячна галявина</span>
    </div>

    <!-- Active Match Multitouch Controls -->
    <section id="match-controls" class="match-controls" aria-label="Керування їжачком" hidden>
      <div class="control-cluster move-cluster">
        <button id="btn-move-left" type="button" class="touch-btn" data-hold="left" aria-label="Рух ліворуч">◀ Ліворуч</button>
        <button id="btn-move-right" type="button" class="touch-btn" data-hold="right" aria-label="Рух праворуч">Праворуч ▶</button>
        <button id="btn-jump-long" type="button" class="touch-btn" aria-label="Стрибок уперед">Стрибок ↗</button>
        <button id="btn-jump-high" type="button" class="touch-btn" aria-label="Високе сальто">Сальто ↑</button>
      </div>

      <div class="control-cluster weapon-cluster">
        <div class="weapon-row">
          <button id="btn-weapon-rocket" type="button" class="touch-btn weapon-btn active-weapon">
            🚀 Ракета <span id="ammo-rocket">99</span>
          </button>
          <button id="btn-weapon-grenade" type="button" class="touch-btn weapon-btn">
            💣 Граната <span id="ammo-grenade">6</span>
          </button>
        </div>
        <div id="fuse-row" class="fuse-row" hidden>
          <span class="fuse-label">Запал:</span>
          <button type="button" class="fuse-btn" data-fuse="1">1с</button>
          <button type="button" class="fuse-btn" data-fuse="2">2с</button>
          <button type="button" class="fuse-btn active-fuse" data-fuse="3">3с</button>
          <button type="button" class="fuse-btn" data-fuse="4">4с</button>
          <button type="button" class="fuse-btn" data-fuse="5">5с</button>
        </div>
      </div>

      <div class="control-cluster aim-cluster">
        <button id="btn-aim-up" type="button" class="touch-btn" data-hold="aim-up" aria-label="Приціл вище">▲ Вище</button>
        <button id="btn-aim-down" type="button" class="touch-btn" data-hold="aim-down" aria-label="Приціл нижче">▼ Нижче</button>
        <div class="fire-box">
          <button id="btn-fire" type="button" class="touch-btn fire-btn" aria-label="Постріл. Утримуй для сили">
            🔥 Вогонь!
          </button>
          <div class="charge-track" aria-hidden="true"><div id="charge-fill" class="charge-fill"></div></div>
        </div>
      </div>
    </section>

    <!-- Entry Panel (Create / Join Room) -->
    <section id="entry-panel" class="card-panel" aria-label="Кімнати для гри">
      <div class="entry-grid">
        <div class="entry-block">
          <h2>Твоя команда</h2>
          <label class="field-group" for="team-name-input">
            <span>Назва загону</span>
            <input id="team-name-input" type="text" maxlength="24" value="Колючі мандрівники" />
          </label>
          <div class="color-picker" role="group" aria-label="Колір і символ команди">
            ${TEAM_PRESETS_UK.map(
              (preset, idx) => `
              <button type="button" class="color-chip ${idx === 0 ? 'selected-chip' : ''}" data-color="${idx}" style="--chip-color: ${preset.hex}">
                ${preset.symbol} ${preset.name.split(' ')[0]}
              </button>
            `,
            ).join('')}
          </div>
          <button id="btn-create-room" type="button" class="primary-btn">Створити кімнату</button>
        </div>

        <div class="entry-block">
          <h2>Маєш код кімнати?</h2>
          <label class="field-group" for="room-code-input">
            <span>Код кімнати (4 символи)</span>
            <input id="room-code-input" type="text" maxlength="8" placeholder="Наприклад: A7K2" autocomplete="off" />
          </label>
          <button id="btn-join-room" type="button" class="secondary-btn">Приєднатися до кімнати</button>
        </div>
      </div>

      <div class="wave-bar">
        <button id="wave" type="button" class="secondary-btn">Підбадьорити їжачка <span aria-hidden="true">✦</span></button>
        <p id="wave-status" class="quiet" role="status" aria-live="polite">Натисни — він тобі зрадіє.</p>
      </div>
    </section>

    <!-- Lobby Panel (Waiting / Ready Room) -->
    <section id="lobby-panel" class="card-panel" aria-label="Кімната очікування" hidden>
      <div class="lobby-header">
        <div>
          <span class="quiet-label">Код приватного бою:</span>
          <strong id="lobby-room-code" class="room-code-badge">----</strong>
        </div>
        <button id="btn-leave-room" type="button" class="secondary-btn">Вийти з кімнати</button>
      </div>

      <p id="lobby-status-text" class="lobby-status" role="status" aria-live="polite">
        Очікуємо від 2 до 4 гравців…
      </p>

      <ul id="lobby-players" class="player-list" aria-label="Гравці в кімнаті"></ul>

      <div id="host-settings" class="host-settings" hidden>
        <h3>Налаштування господаря кімнати</h3>
        <div class="settings-grid">
          <label class="field-group" for="setting-turn-sec">
            <span>Час на хід</span>
            <select id="setting-turn-sec">
              <option value="25">25 сек</option>
              <option value="45" selected>45 сек</option>
              <option value="60">60 сек</option>
            </select>
          </label>
          <label class="field-group" for="setting-hogs-count">
            <span>Їжачків у команді</span>
            <select id="setting-hogs-count">
              <option value="1">1 їжачок</option>
              <option value="2">2 їжачки</option>
              <option value="3" selected>3 їжачки</option>
              <option value="4">4 їжачки</option>
            </select>
          </label>
          <label class="field-group" for="setting-grenades">
            <span>Гранати на команду</span>
            <select id="setting-grenades">
              <option value="3">3 шт.</option>
              <option value="6" selected>6 шт.</option>
              <option value="10">10 шт.</option>
            </select>
          </label>
        </div>
      </div>

      <div class="lobby-actions">
        <button id="btn-ready" type="button" class="primary-btn">Готовий до бою!</button>
        <button id="btn-start-match" type="button" class="primary-btn start-btn" hidden disabled>
          Почати баталію!
        </button>
      </div>
    </section>

    <!-- Results Panel -->
    <section id="results-panel" class="card-panel" aria-label="Підсумки гри" hidden>
      <h2 id="results-headline">Підсумки баталії</h2>
      <p id="results-subtitle" class="lead"></p>
      <ul id="results-standings" class="player-list"></ul>
      <div class="lobby-actions">
        <button id="btn-rematch" type="button" class="primary-btn">Зіграти ще раз (Реванш)</button>
        <button id="btn-results-leave" type="button" class="secondary-btn">Вийти з кімнати</button>
      </div>
    </section>
  </main>
`;

// Unlock audio on first user gesture
const unlockAudioOnce = () => {
  sound.unlockFromGesture();
};
window.addEventListener('pointerdown', unlockAudioOnce, { passive: true });
window.addEventListener('keydown', unlockAudioOnce, { passive: true });

// DOM elements
const statusEl = document.querySelector<HTMLElement>('#connection')!;
const rttBadgeEl = document.querySelector<HTMLElement>('#rtt-badge')!;
const btnMute = document.querySelector<HTMLButtonElement>('#btn-mute')!;
const heroIntro = document.querySelector<HTMLElement>('#hero-intro')!;
const errorBanner = document.querySelector<HTMLElement>('#error-banner')!;
const errorText = document.querySelector<HTMLElement>('#error-text')!;
const btnReloadApp = document.querySelector<HTMLButtonElement>('#btn-reload-app')!;
const pauseBanner = document.querySelector<HTMLElement>('#pause-banner')!;

const matchHud = document.querySelector<HTMLElement>('#match-hud')!;
const activeTurnLabel = document.querySelector<HTMLElement>('#active-turn-label')!;
const turnTimerLabel = document.querySelector<HTMLElement>('#turn-timer-label')!;
const windLabel = document.querySelector<HTMLElement>('#wind-label')!;
const teamHealthStrip = document.querySelector<HTMLElement>('#team-health-strip')!;
const btnCameraToggle = document.querySelector<HTMLButtonElement>('#btn-camera-toggle')!;
const btnMatchLeave = document.querySelector<HTMLButtonElement>('#btn-match-leave')!;
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

// Instantiate Match Renderer
const { createMatchRenderer } = await import('./renderer');
const renderer = createMatchRenderer('field', () => {
  sound.play('wave');
  const waveStatus = document.querySelector('#wave-status');
  if (waveStatus) {
    waveStatus.textContent = 'Їжачок передає тобі колючі обійми!';
  }
});

document.querySelector('#wave')!.addEventListener('click', () => {
  renderer.wave();
});

btnMute.addEventListener('click', () => {
  const muted = sound.toggleMute();
  btnMute.textContent = muted ? '🔇 Без звуку' : '🔊 Звук';
});

btnReloadApp.addEventListener('click', () => {
  location.reload();
});

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
    }, 5000);
  }
}

// Color picker in entry panel
document.querySelectorAll<HTMLButtonElement>('.color-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document
      .querySelectorAll('.color-chip')
      .forEach((c) => c.classList.remove('selected-chip'));
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

// Host settings changes
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
  const overview = renderer.toggleOverview();
  btnCameraToggle.textContent = overview ? '🎯 На їжачка' : '🔍 Вся мапа';
});

// Weapon & fuse selection
btnWeaponRocket.addEventListener('click', () => {
  localSelectedWeapon = 'rocket';
  btnWeaponRocket.classList.add('active-weapon');
  btnWeaponGrenade.classList.remove('active-weapon');
  fuseRow.hidden = true;
  if (isMyTurnInControl()) {
    sendMatchCommand({ kind: 'selectWeapon', weapon: 'rocket' });
  }
});

btnWeaponGrenade.addEventListener('click', () => {
  localSelectedWeapon = 'grenade';
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

// Independent multitouch hold buttons (left, right, aim-up, aim-down) (UI-03 / UI-A02)
document.querySelectorAll<HTMLButtonElement>('[data-hold]').forEach((btn) => {
  const holdKind = btn.dataset.hold as 'left' | 'right' | 'aim-up' | 'aim-down';

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try {
      btn.setPointerCapture(e.pointerId);
    } catch {
      // ignore synthetic pointer events without capture support
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

// Fire button: hold to charge power, release to fire (also supports quick tap)
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

// Release all held inputs on blur or visibility loss (UI-03 / UI-A02 / NET-04)
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

// 60 Hz local aim & power charge update loop for immediate zero-RTT feedback (UI-A03)
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

// Render UI sections according to room & match state
function updatePanels(): void {
  const inRoom = currentRoomCode !== null && currentRoomStatus !== 'closed';
  const isPlaying = inRoom && currentRoomStatus === 'playing';
  const isResults = inRoom && currentRoomStatus === 'results';
  const isLobby = inRoom && (currentRoomStatus === 'waiting' || currentRoomStatus === 'ready');

  entryPanel.hidden = inRoom;
  lobbyPanel.hidden = !isLobby;
  matchHud.hidden = !isPlaying;
  matchControls.hidden = !isPlaying;
  resultsPanel.hidden = !isResults;
  heroIntro.classList.toggle('compact-hero', isPlaying);

  if (!inRoom) {
    pauseBanner.hidden = true;
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
      btnReady.textContent = me.ready ? 'Готовий! (Скасувати)' : 'Готовий до бою!';
      btnReady.classList.toggle('ready-active', me.ready);
    }

    if (currentPlayers.length < 2) {
      lobbyStatusText.textContent =
        'Запроси друзів за кодом кімнати — потрібно щонайменше 2 гравці.';
    } else if (currentRoomStatus === 'ready') {
      lobbyStatusText.textContent = isHost
        ? 'Усі готові! Натискай «Почати баталію!»'
        : 'Усі готові! Чекаємо, поки господар кімнати розпочне бій…';
    } else {
      lobbyStatusText.textContent = 'Чекаємо, поки всі гравці натиснуть «Готовий до бою!»';
    }

    lobbyPlayers.innerHTML = currentPlayers
      .map((p) => {
        const preset = TEAM_PRESETS_UK[p.colorIndex % TEAM_PRESETS_UK.length]!;
        const isMe = p.sessionId === mySessionId;
        const isHostPlayer = p.sessionId === currentHostSessionId;
        const stateBadge = !p.connected
          ? 'Тимчасово без зв’язку'
          : p.ready
            ? '✓ Готовий'
            : 'Готується…';
        return `
          <li class="player-row" style="--team-color: ${preset.hex}">
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
    const activeChar = localWorld.characters.find((c) => c.id === localWorld!.activeCharacterId);
    const activePreset = activeTeam
      ? TEAM_PRESETS_UK[activeTeam.colorIndex % TEAM_PRESETS_UK.length]!
      : TEAM_PRESETS_UK[0];

    const myTurn = isMyTurnInControl();
    if (localWorld.phase !== 'control') {
      activeTurnLabel.textContent = '💥 Снаряд у польоті…';
    } else if (myTurn) {
      activeTurnLabel.textContent = `Твій хід! ${activePreset.symbol} ${activeChar?.name ?? ''}`;
    } else {
      activeTurnLabel.textContent = `Хід: ${activePreset.symbol} ${activeTeam?.name ?? ''} (${activeChar?.name ?? ''})`;
    }
    activeTurnLabel.classList.toggle('my-turn-pill', myTurn);

    const secLeft = Math.max(0, Math.ceil(localWorld.turnTicksRemaining / TICKS_PER_SECOND));
    turnTimerLabel.textContent = `⏱ ${secLeft} с`;

    const windPct = Math.round((localWorld.wind / 0.069444) * 100);
    const windDir = windPct > 5 ? '▶' : windPct < -5 ? '◀' : '•';
    windLabel.textContent = `🍃 Вітер: ${windDir} ${Math.abs(windPct)}%`;

    teamHealthStrip.innerHTML = localWorld.teams
      .map((t) => {
        const preset = TEAM_PRESETS_UK[t.colorIndex % TEAM_PRESETS_UK.length]!;
        const teamHp = localWorld!.characters
          .filter((c) => c.teamId === t.id && c.alive)
          .reduce((sum, c) => sum + c.health, 0);
        return `<span class="hp-pill" style="--team-color: ${preset.hex}">${preset.symbol} ${t.name}: ${teamHp}</span>`;
      })
      .join('');

    const myTeamState = localWorld.teams.find((t) => t.id === myTeamId);
    if (myTeamState) {
      ammoRocketEl.textContent = String(myTeamState.inventory.rocket);
      ammoGrenadeEl.textContent = String(myTeamState.inventory.grenade);
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
        <li class="player-row" style="--team-color: ${preset.hex}">
          <span class="team-badge">${idx + 1}. ${preset.symbol} ${entry.teamName}</span>
          <span class="ready-badge">Їжачків: ${entry.survivingHogs} · Здоров’я: ${entry.totalHealth}</span>
        </li>
      `;
    })
    .join('');
}

// WebSocket connection and automatic reconnect
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
      statusEl.textContent = 'Майстерня поки не відповідає. Спробуй завітати пізніше.';
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
      statusEl.textContent = 'Щось завадило привітанню. Спробуй оновити сторінку.';
    }
  });

  ws.addEventListener('close', () => {
    clearTimeout(helloWatchdog);
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    if (connected) {
      statusEl.textContent =
        'Зв’язок із майстернею перервався. Повертаємося до гри…';
      reconnectTimeout = setTimeout(() => connectWebSocket(), 1500);
    }
  });

  ws.addEventListener('error', () => {
    clearTimeout(helloWatchdog);
    statusEl.textContent = 'Зараз без зв’язку. Їжачок усе одно радий тобі!';
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
      statusEl.textContent = 'Майстерня відчинена. Їжачок чекає на привіт!';
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        sendClientMessage({ type: 'client.ping', clientTimeMs: Date.now() });
      }, 4000);
      sendClientMessage({ type: 'client.ping', clientTimeMs: Date.now() });
      break;
    }

    case 'server.pong': {
      const rtt = Math.max(1, Date.now() - msg.clientTimeMs);
      rttBadgeEl.textContent = `Зв’язок: ${rtt} мс`;
      rttBadgeEl.hidden = false;
      break;
    }

    case 'server.error': {
      if (
        msg.code === 'PROTOCOL_MISMATCH' ||
        msg.code === 'RULES_MISMATCH' ||
        msg.code === 'CONTENT_MISMATCH'
      ) {
        statusEl.textContent = msg.messageUk;
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

      // Apply sequential crater edits or request repair snapshot on revision/checksum gap (NET-05 / NET-A05)
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

// Expose read-only diagnostics for automated multi-browser convergence tests (NET-07)
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
