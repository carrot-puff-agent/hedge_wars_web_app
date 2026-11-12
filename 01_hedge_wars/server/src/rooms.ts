import { randomBytes } from 'node:crypto';
import type WebSocket from 'ws';
import {
  CONTENT_HASH,
  DEFAULT_MAP_ID,
  DEFAULT_RECONNECT_GRACE_MS,
  DEFAULT_ROOM_IDLE_EXPIRY_MS,
  ERROR_MESSAGES_UK,
  MAX_ROOM_PLAYERS,
  MIN_ROOM_PLAYERS,
  PROTOCOL_VERSION,
  RULES_VERSION,
  SERVER_CAPABILITIES,
  TEAM_PRESETS_UK,
  sanitiseDisplayName,
  sanitiseRoomCode,
  type ClientMessage,
  type ErrorCode,
  type MatchCommandAction,
  type MatchResultsSummary,
  type PublicRoomPlayer,
  type PublicRoomSummary,
  type RoomSettings,
  type ServerMessage,
  type StandingEntry,
  type TerrainCraterEdit,
} from '@yizhaklub/hedge-protocol';
import {
  TICKS_PER_SECOND,
  buildCuratedMapTerrain,
  computeWorldChecksum,
  consumeDirtyChunks,
  createCharacterState,
  createWorldState,
  getSurvivingTeamIds,
  refreshCharacterGrounding,
  resolveSpawnPoint,
  serializeWorldState,
  stepWorld,
  type CharacterState,
  type SimulationCommand,
  type SimulationEvent,
  type TeamState,
  type WorldState,
} from '@yizhaklub/hedge-simulation';

export interface SessionRecord {
  sessionId: string;
  resumeToken: string;
  socket: WebSocket | null;
  roomCode: string | null;
  teamId: string | null;
  rulesVersion: number;
  contentHash: string;
  createdAtMs: number;
  lastSeenAtMs: number;
  disconnectedAtMs: number | null;
  disconnectTimer: NodeJS.Timeout | null;
  rateWindowStartMs: number;
  rateWindowCount: number;
  subscribedToRoomList: boolean;
}

export interface RoomPlayerRecord {
  sessionId: string;
  teamId: string;
  teamName: string;
  colorIndex: number;
  hogNames: string[];
  ready: boolean;
  connected: boolean;
  disconnectedAtMs: number | null;
  forfeited: boolean;
}

export interface ActiveMatchRecord {
  matchId: string;
  roomCode: string;
  turnIndex: number;
  turnsPlayed: number;
  world: WorldState;
  lastAckSeqByTeam: Record<string, number>;
  nextCharCursorByTeam: Record<string, number>;
  pendingCommands: SimulationCommand[];
  terrainEditSeq: number;
  pendingTerrainEdits: TerrainCraterEdit[];
  pendingEvents: SimulationEvent[];
  tickTimer: NodeJS.Timeout | null;
  networkBroadcastEveryTicks: number;
  ticksSinceLastBroadcast: number;
}

export interface RoomRecord {
  roomCode: string;
  status: 'waiting' | 'ready' | 'playing' | 'results' | 'closed';
  hostSessionId: string;
  settings: RoomSettings;
  players: RoomPlayerRecord[];
  activeMatch: ActiveMatchRecord | null;
  lastResults: MatchResultsSummary | null;
  createdAtMs: number;
  lastActivityAtMs: number;
  matchCounter: number;
}

export interface RoomManagerOptions {
  serverVersion: string;
  reconnectGraceMs?: number;
  roomIdleExpiryMs?: number;
  autoTickMatches?: boolean;
  networkBroadcastEveryTicks?: number;
  maxRooms?: number;
  maxSessions?: number;
  maxCommandsPerSecond?: number;
  seedOverride?: number | string;
  onLog?: (entry: Record<string, unknown>) => void;
}

const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function defaultSettings(): RoomSettings {
  return {
    turnDurationSeconds: 45,
    charactersPerTeam: 3,
    initialHealth: 100,
    rocketAmmo: 99,
    grenadeAmmo: 6,
    disconnectPolicy: 'pause',
    mapId: DEFAULT_MAP_ID,
  };
}

export class RoomManager {
  private readonly sessionsById = new Map<string, SessionRecord>();
  private readonly sessionsByResumeToken = new Map<string, SessionRecord>();
  private readonly sessionsBySocket = new Map<WebSocket, SessionRecord>();
  private readonly roomsByCode = new Map<string, RoomRecord>();

  private readonly serverVersion: string;
  private readonly reconnectGraceMs: number;
  private readonly roomIdleExpiryMs: number;
  private readonly autoTickMatches: boolean;
  private readonly networkBroadcastEveryTicks: number;
  private readonly maxRooms: number;
  private readonly maxSessions: number;
  private readonly maxCommandsPerSecond: number;
  private readonly seedOverride?: number | string;
  private readonly log: (entry: Record<string, unknown>) => void;
  private readonly expirySweepTimer: NodeJS.Timeout | null;

  constructor(options: RoomManagerOptions) {
    this.serverVersion = options.serverVersion;
    this.reconnectGraceMs = options.reconnectGraceMs ?? DEFAULT_RECONNECT_GRACE_MS;
    this.roomIdleExpiryMs = options.roomIdleExpiryMs ?? DEFAULT_ROOM_IDLE_EXPIRY_MS;
    this.autoTickMatches = options.autoTickMatches ?? true;
    this.networkBroadcastEveryTicks = options.networkBroadcastEveryTicks ?? 2;
    this.maxRooms = options.maxRooms ?? 32;
    this.maxSessions = options.maxSessions ?? 128;
    this.maxCommandsPerSecond = options.maxCommandsPerSecond ?? 90;
    this.seedOverride = options.seedOverride;
    this.log =
      options.onLog ??
      ((entry) => {
        if (!process.env.NODE_TEST_CONTEXT && process.env.NODE_ENV !== 'test') {
          console.info(JSON.stringify({ at: new Date().toISOString(), ...entry }));
        }
      });
    this.expirySweepTimer = setInterval(() => {
      this.sweepExpiredRooms();
    }, 5_000);
    this.expirySweepTimer.unref?.();
  }

  public getRoomCount(): number {
    return this.roomsByCode.size;
  }

  public getSessionCount(): number {
    return this.sessionsById.size;
  }

  public getRoom(roomCode: string): RoomRecord | undefined {
    return this.roomsByCode.get(sanitiseRoomCode(roomCode));
  }

  private send(socket: WebSocket | null, message: ServerMessage): void {
    if (!socket || socket.readyState !== 1) return;
    socket.send(JSON.stringify(message));
  }

  private sendError(
    socket: WebSocket | null,
    code: ErrorCode,
    requiresReload?: boolean,
  ): void {
    this.send(socket, {
      type: 'server.error',
      code,
      messageUk: ERROR_MESSAGES_UK[code],
      ...(requiresReload ? { requiresReload: true } : {}),
    });
  }

  private checkRateLimit(session: SessionRecord): boolean {
    const now = Date.now();
    if (now - session.rateWindowStartMs >= 1000) {
      session.rateWindowStartMs = now;
      session.rateWindowCount = 1;
      return true;
    }
    session.rateWindowCount += 1;
    return session.rateWindowCount <= this.maxCommandsPerSecond;
  }

  public handleClientMessage(socket: WebSocket, message: ClientMessage): boolean {
    if (message.type === 'client.hello') {
      return this.handleHello(socket, message);
    }

    const session = this.sessionsBySocket.get(socket);
    if (!session) {
      this.sendError(socket, 'HELLO_REQUIRED');
      return false;
    }
    session.lastSeenAtMs = Date.now();

    if (!this.checkRateLimit(session)) {
      this.sendError(socket, 'RATE_LIMITED');
      return false;
    }

    switch (message.type) {
      case 'client.ping':
        this.send(socket, {
          type: 'server.pong',
          clientTimeMs: message.clientTimeMs,
          serverTimeMs: Date.now(),
        });
        return true;
      case 'room.list':
        session.subscribedToRoomList = true;
        this.sweepExpiredRooms();
        this.sendRoomsList(socket);
        return true;
      case 'room.create':
        this.handleRoomCreate(session, message);
        return true;
      case 'room.join':
        this.handleRoomJoin(session, message);
        return true;
      case 'room.leave':
        this.handleRoomLeave(session, 'voluntary');
        return true;
      case 'room.configure_team':
        this.handleConfigureTeam(session, message);
        return true;
      case 'room.configure':
        this.handleConfigureRoom(session, message);
        return true;
      case 'room.ready':
        this.handleReady(session, message.ready);
        return true;
      case 'room.start':
        this.handleStartMatch(session);
        return true;
      case 'room.rematch':
        this.handleRematch(session);
        return true;
      case 'match.command':
        this.handleMatchCommand(session, message);
        return true;
      case 'match.release_inputs':
        this.handleReleaseInputs(session, message.matchId);
        return true;
      case 'match.request_snapshot':
        this.handleRequestSnapshot(session, message.matchId);
        return true;
    }
  }

  private handleHello(
    socket: WebSocket,
    message: Extract<ClientMessage, { type: 'client.hello' }>,
  ): boolean {
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      this.sendError(socket, 'PROTOCOL_MISMATCH', true);
      socket.close(1008, 'PROTOCOL_MISMATCH');
      return false;
    }
    if (message.rulesVersion !== undefined && message.rulesVersion !== RULES_VERSION) {
      this.sendError(socket, 'RULES_MISMATCH', true);
      socket.close(1008, 'RULES_MISMATCH');
      return false;
    }
    if (message.contentHash !== undefined && message.contentHash !== CONTENT_HASH) {
      this.sendError(socket, 'CONTENT_MISMATCH', true);
      socket.close(1008, 'CONTENT_MISMATCH');
      return false;
    }

    const now = Date.now();
    let session: SessionRecord | undefined;
    let resumed = false;

    if (message.resumeToken) {
      const candidate = this.sessionsByResumeToken.get(message.resumeToken);
      if (candidate) {
        session = candidate;
        resumed = true;
        if (session.disconnectTimer) {
          clearTimeout(session.disconnectTimer);
          session.disconnectTimer = null;
        }
        if (session.socket && session.socket !== socket) {
          this.sessionsBySocket.delete(session.socket);
          try {
            session.socket.close(1000, 'REPLACED_BY_RESUME');
          } catch {
            // ignore
          }
        }
        session.socket = socket;
        session.disconnectedAtMs = null;
        session.lastSeenAtMs = now;
        this.sessionsBySocket.set(socket, session);
      }
    }

    if (!session) {
      if (this.sessionsById.size >= this.maxSessions) {
        this.pruneIdleSessions();
      }
      const sessionId = `sess_${randomBytes(8).toString('hex')}`;
      const resumeToken = randomBytes(24).toString('hex');
      session = {
        sessionId,
        resumeToken,
        socket,
        roomCode: null,
        teamId: null,
        rulesVersion: message.rulesVersion ?? RULES_VERSION,
        contentHash: message.contentHash ?? CONTENT_HASH,
        createdAtMs: now,
        lastSeenAtMs: now,
        disconnectedAtMs: null,
        disconnectTimer: null,
        rateWindowStartMs: now,
        rateWindowCount: 0,
        subscribedToRoomList: false,
      };
      this.sessionsById.set(sessionId, session);
      this.sessionsByResumeToken.set(resumeToken, session);
      this.sessionsBySocket.set(socket, session);
    }

    let resumedRoomCode: string | null = null;
    if (resumed && session.roomCode) {
      const room = this.roomsByCode.get(session.roomCode);
      const player = room?.players.find((p) => p.sessionId === session!.sessionId);
      if (room && player && room.status !== 'closed') {
        player.connected = true;
        player.disconnectedAtMs = null;
        resumedRoomCode = room.roomCode;
      } else {
        session.roomCode = null;
        session.teamId = null;
      }
    }

    this.send(socket, {
      type: 'server.hello',
      protocolVersion: PROTOCOL_VERSION,
      rulesVersion: RULES_VERSION,
      contentHash: CONTENT_HASH,
      gameId: 'hedge-wars',
      serverVersion: this.serverVersion,
      sessionId: session.sessionId,
      resumeToken: session.resumeToken,
      resumed,
      resumedRoomCode,
      capabilities: [...SERVER_CAPABILITIES],
    });

    if (resumed && resumedRoomCode) {
      const room = this.roomsByCode.get(resumedRoomCode)!;
      this.log({
        event: 'session.resumed',
        sessionId: session.sessionId,
        roomCode: room.roomCode,
      });
      this.broadcastRoomState(room);
      if (room.activeMatch) {
        this.sendMatchSnapshot(socket, room, room.activeMatch);
      }
    }

    return true;
  }

  public handleSocketClose(socket: WebSocket): void {
    const session = this.sessionsBySocket.get(socket);
    if (!session) return;
    this.sessionsBySocket.delete(socket);
    if (session.socket !== socket) return;

    session.socket = null;
    const now = Date.now();
    session.disconnectedAtMs = now;

    if (session.roomCode) {
      const room = this.roomsByCode.get(session.roomCode);
      const player = room?.players.find((p) => p.sessionId === session.sessionId);
      if (room && player) {
        player.connected = false;
        player.disconnectedAtMs = now;
        // Release any held movement inputs immediately on disconnect (NET-04 / NET-A04)
        if (room.activeMatch && session.teamId) {
          this.releaseTeamInputs(room.activeMatch, session.teamId);
        }
        this.recomputeRoomReadyStatus(room);
        this.broadcastRoomState(room);
      }
    }

    if (session.disconnectTimer) {
      clearTimeout(session.disconnectTimer);
    }
    session.disconnectTimer = setTimeout(() => {
      this.expireDisconnectedSession(session.sessionId);
    }, this.reconnectGraceMs);
    session.disconnectTimer.unref?.();
  }

  public expireDisconnectedSession(sessionId: string): void {
    const session = this.sessionsById.get(sessionId);
    if (!session || session.socket !== null) return;
    if (session.disconnectTimer) {
      clearTimeout(session.disconnectTimer);
      session.disconnectTimer = null;
    }

    if (session.roomCode) {
      const room = this.roomsByCode.get(session.roomCode);
      if (room) {
        if (room.status === 'playing' && room.activeMatch) {
          const player = room.players.find((p) => p.sessionId === session.sessionId);
          if (player && !player.forfeited) {
            player.forfeited = true;
            this.forfeitTeamInMatch(room, room.activeMatch, player.teamId);
          }
          if (room.hostSessionId === session.sessionId) {
            this.reassignRoomHost(room);
          }
          this.broadcastRoomState(room);
        } else {
          this.handleRoomLeave(session, 'closed');
        }
      }
    }

    this.sessionsById.delete(session.sessionId);
    this.sessionsByResumeToken.delete(session.resumeToken);
  }

  private pruneIdleSessions(): void {
    for (const [id, sess] of this.sessionsById) {
      if (!sess.socket && !sess.roomCode) {
        if (sess.disconnectTimer) clearTimeout(sess.disconnectTimer);
        this.sessionsById.delete(id);
        this.sessionsByResumeToken.delete(sess.resumeToken);
      }
    }
  }

  private generateUniqueRoomCode(): string {
    for (let attempt = 0; attempt < 64; attempt++) {
      let code = '';
      const bytes = randomBytes(4);
      for (let i = 0; i < 4; i++) {
        code += ROOM_CODE_ALPHABET[bytes[i]! % ROOM_CODE_ALPHABET.length];
      }
      if (!this.roomsByCode.has(code)) {
        return code;
      }
    }
    throw new Error('Unable to allocate unique room code');
  }

  private buildTeamPlayerRecord(
    sessionId: string,
    slotIndex: number,
    options: { teamName?: string; colorIndex?: number; hogNames?: string[] },
    existingColors: Set<number>,
  ): RoomPlayerRecord {
    const preset = TEAM_PRESETS_UK[slotIndex % TEAM_PRESETS_UK.length]!;
    let colorIndex =
      options.colorIndex !== undefined && !existingColors.has(options.colorIndex)
        ? options.colorIndex
        : preset.colorIndex;
    if (existingColors.has(colorIndex)) {
      for (let c = 0; c < TEAM_PRESETS_UK.length; c++) {
        if (!existingColors.has(c)) {
          colorIndex = c;
          break;
        }
      }
    }
    const colorPreset = TEAM_PRESETS_UK[colorIndex] ?? preset;
    const teamName = sanitiseDisplayName(options.teamName, colorPreset.name, 24);
    const hogNames = [0, 1, 2, 3].map((idx) =>
      sanitiseDisplayName(
        options.hogNames?.[idx],
        colorPreset.hogs[idx] ?? `Їжачок ${idx + 1}`,
        18,
      ),
    );
    return {
      sessionId,
      teamId: `team-${slotIndex + 1}`,
      teamName,
      colorIndex,
      hogNames,
      ready: true,
      connected: true,
      disconnectedAtMs: null,
      forfeited: false,
    };
  }

  private handleRoomCreate(
    session: SessionRecord,
    message: Extract<ClientMessage, { type: 'room.create' }>,
  ): void {
    if (session.roomCode) {
      this.sendError(session.socket, 'ALREADY_IN_ROOM');
      return;
    }
    this.sweepExpiredRooms();
    if (this.roomsByCode.size >= this.maxRooms) {
      this.pruneClosedRooms();
    }
    const now = Date.now();
    const roomCode = this.generateUniqueRoomCode();
    const player = this.buildTeamPlayerRecord(session.sessionId, 0, message, new Set());
    const room: RoomRecord = {
      roomCode,
      status: 'waiting',
      hostSessionId: session.sessionId,
      settings: defaultSettings(),
      players: [player],
      activeMatch: null,
      lastResults: null,
      createdAtMs: now,
      lastActivityAtMs: now,
      matchCounter: 0,
    };
    this.roomsByCode.set(roomCode, room);
    session.roomCode = roomCode;
    session.teamId = player.teamId;

    this.log({
      event: 'room.created',
      roomCode,
      hostSessionId: session.sessionId,
    });
    this.broadcastRoomState(room);
  }

  private handleRoomJoin(
    session: SessionRecord,
    message: Extract<ClientMessage, { type: 'room.join' }>,
  ): void {
    if (session.roomCode) {
      this.sendError(session.socket, 'ALREADY_IN_ROOM');
      return;
    }
    this.sweepExpiredRooms();
    const roomCode = sanitiseRoomCode(message.roomCode);
    const room = this.roomsByCode.get(roomCode);
    if (!room || room.status === 'closed') {
      this.sendError(session.socket, 'ROOM_NOT_FOUND');
      return;
    }
    if (room.status === 'playing') {
      this.sendError(session.socket, 'ROOM_ALREADY_STARTED');
      return;
    }
    if (room.players.length >= MAX_ROOM_PLAYERS) {
      this.sendError(session.socket, 'ROOM_FULL');
      return;
    }

    const usedTeamNums = new Set(
      room.players.map((p) => Number(p.teamId.replace('team-', '')) - 1),
    );
    let slotIndex = 0;
    while (usedTeamNums.has(slotIndex)) slotIndex++;

    const existingColors = new Set(room.players.map((p) => p.colorIndex));
    const player = this.buildTeamPlayerRecord(session.sessionId, slotIndex, message, existingColors);
    room.players.push(player);
    room.lastActivityAtMs = Date.now();
    session.roomCode = room.roomCode;
    session.teamId = player.teamId;

    this.recomputeRoomReadyStatus(room);
    this.log({
      event: 'room.joined',
      roomCode: room.roomCode,
      sessionId: session.sessionId,
      teamId: player.teamId,
      playerCount: room.players.length,
    });
    this.broadcastRoomState(room);
  }

  private handleRoomLeave(
    session: SessionRecord,
    reason: 'voluntary' | 'closed' | 'expired',
  ): void {
    if (!session.roomCode) {
      this.sendError(session.socket, 'NOT_IN_ROOM');
      return;
    }
    const room = this.roomsByCode.get(session.roomCode);
    const oldRoomCode = session.roomCode;
    const oldTeamId = session.teamId;
    session.roomCode = null;
    session.teamId = null;

    this.send(session.socket, {
      type: 'room.left',
      roomCode: oldRoomCode,
      reason,
    });

    if (!room) return;

    room.players = room.players.filter((p) => p.sessionId !== session.sessionId);
    room.lastActivityAtMs = Date.now();

    if (room.status === 'playing' && room.activeMatch && oldTeamId) {
      this.forfeitTeamInMatch(room, room.activeMatch, oldTeamId);
    }

    if (room.players.length === 0 || room.players.every((p) => !p.connected && p.forfeited)) {
      this.closeRoom(room);
      this.broadcastRoomsList();
      return;
    }

    if (room.hostSessionId === session.sessionId) {
      this.reassignRoomHost(room);
    }
    this.recomputeRoomReadyStatus(room);
    this.broadcastRoomState(room);
  }

  private reassignRoomHost(room: RoomRecord): void {
    const nextHost =
      room.players.find((p) => p.connected && !p.forfeited) ?? room.players[0];
    if (nextHost) {
      room.hostSessionId = nextHost.sessionId;
    }
  }

  private closeRoom(room: RoomRecord): void {
    if (room.activeMatch?.tickTimer) {
      clearInterval(room.activeMatch.tickTimer);
      room.activeMatch.tickTimer = null;
    }
    room.activeMatch = null;
    room.status = 'closed';
    this.roomsByCode.delete(room.roomCode);
    this.log({ event: 'room.closed', roomCode: room.roomCode });
  }

  public sweepExpiredRooms(nowMs = Date.now()): number {
    let expiredCount = 0;
    for (const [code, room] of this.roomsByCode) {
      if (room.status === 'playing') continue;
      if (nowMs - room.lastActivityAtMs >= this.roomIdleExpiryMs) {
        for (const p of room.players) {
          const sess = this.sessionsById.get(p.sessionId);
          if (sess) {
            sess.roomCode = null;
            sess.teamId = null;
            this.send(sess.socket, {
              type: 'room.left',
              roomCode: code,
              reason: 'expired',
            });
          }
        }
        this.closeRoom(room);
        this.roomsByCode.delete(code);
        expiredCount += 1;
      }
    }
    if (expiredCount > 0) {
      this.broadcastRoomsList(nowMs);
    }
    return expiredCount;
  }

  private buildPublicRoomsList(nowMs = Date.now()): PublicRoomSummary[] {
    const summaries: PublicRoomSummary[] = [];
    for (const room of this.roomsByCode.values()) {
      if (room.status === 'closed' || room.status === 'playing') continue;
      if (room.players.length === 0 || room.players.length >= MAX_ROOM_PLAYERS) continue;
      if (!room.players.some((p) => p.connected)) continue;
      const host =
        room.players.find((p) => p.sessionId === room.hostSessionId) ?? room.players[0]!;
      const elapsedMs = Math.max(0, nowMs - room.lastActivityAtMs);
      const expiresInSeconds = Math.max(
        0,
        Math.ceil((this.roomIdleExpiryMs - elapsedMs) / 1000),
      );
      if (expiresInSeconds <= 0) continue;
      summaries.push({
        roomCode: room.roomCode,
        hostName: host.teamName,
        colorIndex: host.colorIndex,
        playerCount: room.players.length,
        maxPlayers: MAX_ROOM_PLAYERS,
        status: room.status,
        expiresInSeconds,
      });
    }
    return summaries;
  }

  private sendRoomsList(socket: WebSocket | null, nowMs = Date.now()): void {
    this.send(socket, {
      type: 'rooms.list',
      rooms: this.buildPublicRoomsList(nowMs),
    });
  }

  private broadcastRoomsList(nowMs = Date.now()): void {
    const msg: ServerMessage = {
      type: 'rooms.list',
      rooms: this.buildPublicRoomsList(nowMs),
    };
    for (const sess of this.sessionsById.values()) {
      if (sess.subscribedToRoomList && sess.socket) {
        this.send(sess.socket, msg);
      }
    }
  }

  private pruneClosedRooms(): void {
    for (const [code, room] of this.roomsByCode) {
      if (room.status === 'closed' || room.players.length === 0) {
        this.closeRoom(room);
        this.roomsByCode.delete(code);
      }
    }
  }

  private handleConfigureTeam(
    session: SessionRecord,
    message: Extract<ClientMessage, { type: 'room.configure_team' }>,
  ): void {
    const room = session.roomCode ? this.roomsByCode.get(session.roomCode) : undefined;
    if (!room) {
      this.sendError(session.socket, 'NOT_IN_ROOM');
      return;
    }
    if (room.status === 'playing') {
      this.sendError(session.socket, 'ROOM_ALREADY_STARTED');
      return;
    }
    const player = room.players.find((p) => p.sessionId === session.sessionId);
    if (!player) {
      this.sendError(session.socket, 'NOT_IN_ROOM');
      return;
    }
    if (message.colorIndex !== undefined) {
      const takenByOther = room.players.some(
        (p) => p.sessionId !== session.sessionId && p.colorIndex === message.colorIndex,
      );
      if (!takenByOther) {
        player.colorIndex = message.colorIndex;
      }
    }
    if (message.teamName !== undefined) {
      player.teamName = sanitiseDisplayName(message.teamName, player.teamName, 24);
    }
    if (message.hogNames !== undefined) {
      player.hogNames = [0, 1, 2, 3].map((idx) =>
        sanitiseDisplayName(
          message.hogNames?.[idx],
          player.hogNames[idx] ?? `Їжачок ${idx + 1}`,
          18,
        ),
      );
    }
    this.broadcastRoomState(room);
  }

  private handleConfigureRoom(
    session: SessionRecord,
    message: Extract<ClientMessage, { type: 'room.configure' }>,
  ): void {
    const room = session.roomCode ? this.roomsByCode.get(session.roomCode) : undefined;
    if (!room) {
      this.sendError(session.socket, 'NOT_IN_ROOM');
      return;
    }
    if (room.hostSessionId !== session.sessionId) {
      this.sendError(session.socket, 'NOT_ROOM_HOST');
      return;
    }
    if (room.status === 'playing') {
      this.sendError(session.socket, 'ROOM_ALREADY_STARTED');
      return;
    }
    if (message.turnDurationSeconds !== undefined) {
      room.settings.turnDurationSeconds = message.turnDurationSeconds;
    }
    if (message.charactersPerTeam !== undefined) {
      room.settings.charactersPerTeam = message.charactersPerTeam;
    }
    if (message.initialHealth !== undefined) {
      room.settings.initialHealth = message.initialHealth;
    }
    if (message.rocketAmmo !== undefined) {
      room.settings.rocketAmmo = message.rocketAmmo;
    }
    if (message.grenadeAmmo !== undefined) {
      room.settings.grenadeAmmo = message.grenadeAmmo;
    }
    if (message.disconnectPolicy !== undefined) {
      room.settings.disconnectPolicy = message.disconnectPolicy;
    }
    if (message.mapId !== undefined) {
      room.settings.mapId = message.mapId;
    }
    this.broadcastRoomState(room);
  }

  private handleReady(session: SessionRecord, ready: boolean): void {
    const room = session.roomCode ? this.roomsByCode.get(session.roomCode) : undefined;
    if (!room) {
      this.sendError(session.socket, 'NOT_IN_ROOM');
      return;
    }
    if (room.status === 'playing') {
      this.sendError(session.socket, 'ROOM_ALREADY_STARTED');
      return;
    }
    const player = room.players.find((p) => p.sessionId === session.sessionId);
    if (!player) {
      this.sendError(session.socket, 'NOT_IN_ROOM');
      return;
    }
    player.ready = ready;
    this.recomputeRoomReadyStatus(room);
    this.broadcastRoomState(room);
  }

  private recomputeRoomReadyStatus(room: RoomRecord): void {
    if (room.status === 'playing' || room.status === 'closed') return;
    if (room.status === 'results') return;
    const allReady =
      room.players.length >= MIN_ROOM_PLAYERS &&
      room.players.length <= MAX_ROOM_PLAYERS &&
      room.players.every((p) => p.connected && p.ready);
    room.status = allReady ? 'ready' : 'waiting';
  }

  private handleStartMatch(session: SessionRecord): void {
    const room = session.roomCode ? this.roomsByCode.get(session.roomCode) : undefined;
    if (!room) {
      this.sendError(session.socket, 'NOT_IN_ROOM');
      return;
    }
    if (room.hostSessionId !== session.sessionId) {
      this.sendError(session.socket, 'NOT_ROOM_HOST');
      return;
    }
    if (room.status === 'playing') {
      this.sendError(session.socket, 'ROOM_ALREADY_STARTED');
      return;
    }
    this.recomputeRoomReadyStatus(room);
    if (room.status !== 'ready') {
      this.sendError(session.socket, 'NOT_READY_TO_START');
      return;
    }

    // Verify all players' compatibility before starting (NET-06)
    for (const player of room.players) {
      const playerSess = this.sessionsById.get(player.sessionId);
      if (!playerSess || playerSess.rulesVersion !== RULES_VERSION) {
        this.sendError(session.socket, 'RULES_MISMATCH', true);
        return;
      }
      if (playerSess.contentHash !== CONTENT_HASH) {
        this.sendError(session.socket, 'CONTENT_MISMATCH', true);
        return;
      }
    }

    this.startMatchForRoom(room);
  }

  private startMatchForRoom(room: RoomRecord): void {
    room.matchCounter += 1;
    const matchId = `${room.roomCode}-m${room.matchCounter}`;
    const { manifest, terrain } = buildCuratedMapTerrain(room.settings.mapId);

    const teams: TeamState[] = [];
    const characters: CharacterState[] = [];
    const lastAckSeqByTeam: Record<string, number> = {};
    const nextCharCursorByTeam: Record<string, number> = {};

    for (let tIdx = 0; tIdx < room.players.length; tIdx++) {
      const player = room.players[tIdx]!;
      player.forfeited = false;
      teams.push({
        id: player.teamId,
        name: player.teamName,
        colorIndex: player.colorIndex,
        inventory: {
          rocket: room.settings.rocketAmmo,
          grenade: room.settings.grenadeAmmo,
        },
      });
      lastAckSeqByTeam[player.teamId] = 0;
      nextCharCursorByTeam[player.teamId] = 0;

      const teamSpawns = manifest.teamSpawns[tIdx % manifest.teamSpawns.length]!;
      for (let cIdx = 0; cIdx < room.settings.charactersPerTeam; cIdx++) {
        const rawSpawn = teamSpawns[cIdx % teamSpawns.length]!;
        const groundedSpawn = resolveSpawnPoint(terrain, rawSpawn);
        const ch = createCharacterState({
          id: `${player.teamId}-hog-${cIdx + 1}`,
          teamId: player.teamId,
          name: player.hogNames[cIdx] ?? `Їжачок ${cIdx + 1}`,
          x: groundedSpawn.x,
          y: groundedSpawn.y,
          facing: groundedSpawn.facing,
          health: room.settings.initialHealth,
        });
        refreshCharacterGrounding(terrain, ch);
        characters.push(ch);
      }
    }

    const turnTicks = room.settings.turnDurationSeconds * TICKS_PER_SECOND;
    const seed =
      this.seedOverride !== undefined
        ? `${this.seedOverride}:${matchId}`
        : `${room.roomCode}:${matchId}:${Date.now()}`;

    const world = createWorldState({
      seed,
      width: terrain.width,
      height: terrain.height,
      waterLine: terrain.waterLine,
      mask: terrain.mask,
      teams,
      characters,
      turnTicks,
    });

    // Select first team's first character (wind disabled: world.wind remains 0)
    const initEvents: SimulationEvent[] = [];
    const firstTeamId = teams[0]!.id;
    const firstChar = characters.find((c) => c.teamId === firstTeamId && c.alive)!;
    world.activeTeamId = firstTeamId;
    world.activeCharacterId = firstChar.id;
    nextCharCursorByTeam[firstTeamId] = 1;

    const activeMatch: ActiveMatchRecord = {
      matchId,
      roomCode: room.roomCode,
      turnIndex: 0,
      turnsPlayed: 1,
      world,
      lastAckSeqByTeam,
      nextCharCursorByTeam,
      pendingCommands: [],
      terrainEditSeq: 0,
      pendingTerrainEdits: [],
      pendingEvents: [...initEvents],
      tickTimer: null,
      networkBroadcastEveryTicks: this.networkBroadcastEveryTicks,
      ticksSinceLastBroadcast: 0,
    };

    room.status = 'playing';
    room.activeMatch = activeMatch;
    room.lastResults = null;

    if (this.autoTickMatches) {
      activeMatch.tickTimer = setInterval(() => {
        this.stepRoomMatchTick(room);
      }, Math.round(1000 / TICKS_PER_SECOND));
      activeMatch.tickTimer.unref?.();
    }

    this.log({
      event: 'match.started',
      roomCode: room.roomCode,
      matchId,
      players: room.players.length,
    });

    this.broadcastRoomState(room);
    for (const player of room.players) {
      const sess = this.sessionsById.get(player.sessionId);
      if (sess?.socket) {
        this.sendMatchSnapshot(sess.socket, room, activeMatch);
      }
    }
  }

  private handleRematch(session: SessionRecord): void {
    const room = session.roomCode ? this.roomsByCode.get(session.roomCode) : undefined;
    if (!room) {
      this.sendError(session.socket, 'NOT_IN_ROOM');
      return;
    }
    if (room.status !== 'results') {
      this.sendError(session.socket, 'INVALID_PHASE');
      return;
    }
    // Remove any permanently disconnected/forfeited players who never returned
    room.players = room.players.filter((p) => p.connected);
    for (const p of room.players) {
      p.forfeited = false;
      p.ready = true;
    }
    room.status = 'waiting';
    this.recomputeRoomReadyStatus(room);
    this.log({
      event: 'room.rematch_prepared',
      roomCode: room.roomCode,
      status: room.status,
    });
    this.broadcastRoomState(room);
  }

  private isRoomPausedForDisconnect(room: RoomRecord): boolean {
    if (room.status !== 'playing' || !room.activeMatch) return false;
    if (room.settings.disconnectPolicy !== 'pause') return false;
    return room.players.some((p) => !p.connected && !p.forfeited);
  }

  private getPauseRemainingMs(room: RoomRecord): number | null {
    if (!this.isRoomPausedForDisconnect(room)) return null;
    const now = Date.now();
    let minRemaining = this.reconnectGraceMs;
    for (const p of room.players) {
      if (!p.connected && !p.forfeited && p.disconnectedAtMs !== null) {
        const elapsed = Math.max(0, now - p.disconnectedAtMs);
        const rem = Math.max(0, this.reconnectGraceMs - elapsed);
        if (rem < minRemaining) minRemaining = rem;
      }
    }
    return minRemaining;
  }

  private handleMatchCommand(
    session: SessionRecord,
    message: Extract<ClientMessage, { type: 'match.command' }>,
  ): void {
    const room = session.roomCode ? this.roomsByCode.get(session.roomCode) : undefined;
    if (!room || room.status !== 'playing' || !room.activeMatch) {
      this.sendError(session.socket, 'MATCH_NOT_ACTIVE');
      return;
    }
    const match = room.activeMatch;
    if (message.matchId !== match.matchId) {
      this.sendError(session.socket, 'MATCH_NOT_ACTIVE');
      return;
    }
    const teamId = session.teamId;
    if (!teamId) {
      this.sendError(session.socket, 'UNAUTHORIZED_TEAM');
      return;
    }

    const lastSeq = match.lastAckSeqByTeam[teamId] ?? 0;
    if (message.commandSeq <= lastSeq) {
      this.send(session.socket, {
        type: 'match.command_ack',
        matchId: match.matchId,
        commandSeq: message.commandSeq,
        accepted: false,
        tick: match.world.tick,
        reason: 'STALE_COMMAND',
      });
      this.sendError(session.socket, 'STALE_COMMAND');
      return;
    }

    if (match.world.activeTeamId !== teamId) {
      this.send(session.socket, {
        type: 'match.command_ack',
        matchId: match.matchId,
        commandSeq: message.commandSeq,
        accepted: false,
        tick: match.world.tick,
        reason: 'NOT_YOUR_TURN',
      });
      this.sendError(session.socket, 'NOT_YOUR_TURN');
      return;
    }

    if (match.world.phase !== 'control' || this.isRoomPausedForDisconnect(room)) {
      this.send(session.socket, {
        type: 'match.command_ack',
        matchId: match.matchId,
        commandSeq: message.commandSeq,
        accepted: false,
        tick: match.world.tick,
        reason: 'INVALID_PHASE',
      });
      this.sendError(session.socket, 'INVALID_PHASE');
      return;
    }

    const activeCharacterId = match.world.activeCharacterId;
    const activeChar = match.world.characters.find((c) => c.id === activeCharacterId);
    const activeTeam = match.world.teams.find((t) => t.id === teamId);
    if (!activeCharacterId || !activeChar || !activeChar.alive || !activeTeam) {
      this.sendError(session.socket, 'INVALID_PHASE');
      return;
    }

    // Check weapon ammo before accepting a fire command
    if (message.action.kind === 'fire') {
      const weapon = message.action.weapon ?? activeChar.selectedWeapon;
      if (activeTeam.inventory[weapon] <= 0) {
        this.send(session.socket, {
          type: 'match.command_ack',
          matchId: match.matchId,
          commandSeq: message.commandSeq,
          accepted: false,
          tick: match.world.tick,
          reason: 'OUT_OF_AMMO',
        });
        this.sendError(session.socket, 'OUT_OF_AMMO');
        return;
      }
    }

    match.lastAckSeqByTeam[teamId] = message.commandSeq;

    if (message.action.kind === 'skipTurn') {
      activeChar.moveInput = 0;
      this.advanceToNextTurn(room, match);
      this.send(session.socket, {
        type: 'match.command_ack',
        matchId: match.matchId,
        commandSeq: message.commandSeq,
        accepted: true,
        tick: match.world.tick,
      });
      this.broadcastMatchState(room, match);
      return;
    }

    const simCommands = this.translateActionToSimulationCommands(
      activeCharacterId,
      activeChar.aimAngleDeg,
      message.action,
    );
    match.pendingCommands.push(...simCommands);

    this.send(session.socket, {
      type: 'match.command_ack',
      matchId: match.matchId,
      commandSeq: message.commandSeq,
      accepted: true,
      tick: match.world.tick,
    });
  }

  private translateActionToSimulationCommands(
    characterId: string,
    currentAimAngleDeg: number,
    action: Exclude<MatchCommandAction, { kind: 'skipTurn' }>,
  ): SimulationCommand[] {
    switch (action.kind) {
      case 'move':
        return [{ type: 'move', characterId, direction: action.direction }];
      case 'aim':
        return [
          {
            type: 'aim',
            characterId,
            angleDeg: action.angleDeg,
            ...(action.facing !== undefined ? { facing: action.facing } : {}),
          },
        ];
      case 'jump': {
        const cmds: SimulationCommand[] = [];
        if (action.facing !== undefined) {
          cmds.push({
            type: 'aim',
            characterId,
            angleDeg: currentAimAngleDeg,
            facing: action.facing,
          });
        }
        cmds.push({ type: 'jump', characterId, kind: action.jumpKind });
        return cmds;
      }
      case 'selectWeapon':
        return [
          {
            type: 'selectWeapon',
            characterId,
            weapon: action.weapon,
            ...(action.grenadeFuseSeconds !== undefined
              ? { grenadeFuseTicks: action.grenadeFuseSeconds * TICKS_PER_SECOND }
              : {}),
          },
        ];
      case 'fire': {
        const cmds: SimulationCommand[] = [];
        if (action.weapon !== undefined || action.grenadeFuseSeconds !== undefined) {
          cmds.push({
            type: 'selectWeapon',
            characterId,
            weapon: action.weapon ?? 'rocket',
            ...(action.grenadeFuseSeconds !== undefined
              ? { grenadeFuseTicks: action.grenadeFuseSeconds * TICKS_PER_SECOND }
              : {}),
          });
        }
        if (action.angleDeg !== undefined || action.facing !== undefined) {
          cmds.push({
            type: 'aim',
            characterId,
            angleDeg: action.angleDeg ?? 0,
            ...(action.facing !== undefined ? { facing: action.facing } : {}),
          });
        }
        cmds.push({ type: 'fire', characterId, power: action.power });
        return cmds;
      }
    }
  }

  private handleReleaseInputs(session: SessionRecord, matchId: string): void {
    const room = session.roomCode ? this.roomsByCode.get(session.roomCode) : undefined;
    if (!room || !room.activeMatch || room.activeMatch.matchId !== matchId) return;
    if (!session.teamId) return;
    this.releaseTeamInputs(room.activeMatch, session.teamId);
  }

  private releaseTeamInputs(match: ActiveMatchRecord, teamId: string): void {
    for (const ch of match.world.characters) {
      if (ch.teamId === teamId && ch.moveInput !== 0) {
        ch.moveInput = 0;
      }
    }
    match.pendingCommands = match.pendingCommands.filter(
      (cmd) => cmd.type === 'rollWind' || !cmd.characterId.startsWith(`${teamId}-`),
    );
  }

  private handleRequestSnapshot(session: SessionRecord, matchId: string): void {
    const room = session.roomCode ? this.roomsByCode.get(session.roomCode) : undefined;
    if (!room || !room.activeMatch || room.activeMatch.matchId !== matchId) {
      this.sendError(session.socket, 'MATCH_NOT_ACTIVE');
      return;
    }
    if (session.socket) {
      this.sendMatchSnapshot(session.socket, room, room.activeMatch);
    }
  }

  public stepRoomTicks(roomCode: string, count = 1): void {
    const room = this.roomsByCode.get(sanitiseRoomCode(roomCode));
    if (!room) return;
    for (let i = 0; i < count; i++) {
      if (room.status !== 'playing' || !room.activeMatch) break;
      this.stepRoomMatchTick(room);
    }
  }

  private stepRoomMatchTick(room: RoomRecord): void {
    const match = room.activeMatch;
    if (!match || room.status !== 'playing') return;

    if (this.isRoomPausedForDisconnect(room)) {
      return;
    }

    const world = match.world;
    const hadCommands = match.pendingCommands.length > 0;
    const prevPhase = world.phase;
    const prevTerrainRevision = world.terrain.revision;

    // If turn clock ran out during 'control' before firing, release walk input and resolve turn
    if (world.phase === 'control' && world.turnTicksRemaining <= 0) {
      if (world.activeCharacterId) {
        const activeChar = world.characters.find((c) => c.id === world.activeCharacterId);
        if (activeChar) activeChar.moveInput = 0;
      }
      world.phase = 'resolve';
    }

    const commandsToRun = match.pendingCommands.splice(0, match.pendingCommands.length);
    const events = stepWorld(world, commandsToRun);
    match.pendingEvents.push(...events);

    // Record any terrain craters created during this tick
    if (world.terrain.revision > prevTerrainRevision) {
      const { dirtyChunks } = consumeDirtyChunks(world.terrain);
      for (const ev of events) {
        if (ev.type === 'explosion' && ev.clearedCells > 0) {
          match.terrainEditSeq += 1;
          match.pendingTerrainEdits.push({
            sequence: match.terrainEditSeq,
            previousRevision: prevTerrainRevision,
            revision: ev.terrainRevision,
            x: ev.x,
            y: ev.y,
            radius: ev.radius,
            clearedCells: ev.clearedCells,
            checksum: world.terrain.checksum,
            dirtyChunks,
          });
        }
      }
    }

    // Handle turn settlement or match completion
    const settledThisTick = events.some((ev) => ev.type === 'world.settled');
    if (world.phase === 'finished') {
      this.finishMatch(room, match);
      return;
    }

    if (settledThisTick && world.phase === 'control') {
      this.advanceToNextTurn(room, match);
    }

    match.ticksSinceLastBroadcast += 1;
    const importantChange =
      hadCommands ||
      events.length > 0 ||
      world.phase !== prevPhase ||
      settledThisTick;

    if (
      importantChange ||
      match.ticksSinceLastBroadcast >= match.networkBroadcastEveryTicks
    ) {
      this.broadcastMatchState(room, match);
      match.ticksSinceLastBroadcast = 0;
    }
  }

  private advanceToNextTurn(room: RoomRecord, match: ActiveMatchRecord): void {
    const world = match.world;
    const survivingTeamIds = getSurvivingTeamIds(world);
    if (survivingTeamIds.length <= 1) {
      world.phase = 'finished';
      world.winnerTeamId = survivingTeamIds[0] ?? null;
      this.finishMatch(room, match);
      return;
    }

    const allTeamIds = world.teams.map((t) => t.id);
    const currentTeamIdx = world.activeTeamId
      ? allTeamIds.indexOf(world.activeTeamId)
      : -1;

    let nextTeamId = survivingTeamIds[0]!;
    for (let offset = 1; offset <= allTeamIds.length; offset++) {
      const candidateTeamId = allTeamIds[(currentTeamIdx + offset) % allTeamIds.length]!;
      if (survivingTeamIds.includes(candidateTeamId)) {
        nextTeamId = candidateTeamId;
        break;
      }
    }

    const teamChars = world.characters.filter(
      (c) => c.teamId === nextTeamId && c.alive && !c.drowning,
    );
    const cursor = match.nextCharCursorByTeam[nextTeamId] ?? 0;
    const nextChar = teamChars[cursor % teamChars.length]!;
    match.nextCharCursorByTeam[nextTeamId] = (cursor + 1) % teamChars.length;

    for (const ch of world.characters) {
      ch.moveInput = 0;
    }

    world.activeTeamId = nextTeamId;
    world.activeCharacterId = nextChar.id;
    world.turnTicksRemaining = room.settings.turnDurationSeconds * TICKS_PER_SECOND;
    world.phase = 'control';
    match.turnIndex += 1;
    match.turnsPlayed += 1;
  }

  private forfeitTeamInMatch(
    room: RoomRecord,
    match: ActiveMatchRecord,
    teamId: string,
  ): void {
    for (const ch of match.world.characters) {
      if (ch.teamId === teamId && ch.alive) {
        ch.moveInput = 0;
        ch.health = 0;
        ch.alive = false;
      }
    }
    const survivingTeams = getSurvivingTeamIds(match.world);
    if (survivingTeams.length <= 1) {
      match.world.phase = 'finished';
      match.world.winnerTeamId = survivingTeams[0] ?? null;
      this.finishMatch(room, match);
      return;
    }
    if (match.world.activeTeamId === teamId) {
      this.advanceToNextTurn(room, match);
      this.broadcastMatchState(room, match);
    }
  }

  private finishMatch(room: RoomRecord, match: ActiveMatchRecord): void {
    if (match.tickTimer) {
      clearInterval(match.tickTimer);
      match.tickTimer = null;
    }
    this.broadcastMatchState(room, match);

    const winnerTeam = match.world.teams.find((t) => t.id === match.world.winnerTeamId) ?? null;
    const standings: StandingEntry[] = room.players.map((p) => {
      const teamChars = match.world.characters.filter((c) => c.teamId === p.teamId);
      const survivingHogs = teamChars.filter((c) => c.alive).length;
      const totalHealth = teamChars.reduce((acc, c) => acc + (c.alive ? c.health : 0), 0);
      return {
        teamId: p.teamId,
        teamName: p.teamName,
        colorIndex: p.colorIndex,
        survivingHogs,
        totalHealth,
        forfeited: p.forfeited,
      };
    });
    standings.sort((a, b) => b.survivingHogs - a.survivingHogs || b.totalHealth - a.totalHealth);

    const results: MatchResultsSummary = {
      matchId: match.matchId,
      roomCode: room.roomCode,
      winnerTeamId: winnerTeam?.id ?? null,
      winnerTeamName: winnerTeam?.name ?? null,
      headlineUk: winnerTeam
        ? `Перемагає команда «${winnerTeam.name}»!`
        : 'Дружня нічия на галявині!',
      subtitleUk: winnerTeam
        ? 'Усі їжачки старалися на славу. Готові до нового раунду?'
        : 'Це була неймовірна пригода! Зіграємо ще раз?',
      turnsPlayed: match.turnsPlayed,
      totalTicks: match.world.tick,
      standings,
    };

    room.status = 'results';
    room.lastResults = results;
    room.activeMatch = null;

    this.log({
      event: 'match.finished',
      roomCode: room.roomCode,
      matchId: match.matchId,
      winnerTeamId: results.winnerTeamId,
      turnsPlayed: results.turnsPlayed,
      totalTicks: results.totalTicks,
    });

    for (const player of room.players) {
      const sess = this.sessionsById.get(player.sessionId);
      this.send(sess?.socket ?? null, { type: 'match.results', results });
    }
    this.broadcastRoomState(room);
  }

  public sendMatchSnapshot(
    socket: WebSocket,
    room: RoomRecord,
    match: ActiveMatchRecord,
  ): void {
    const serialized = serializeWorldState(match.world);
    const worldChecksum = computeWorldChecksum(match.world);
    this.send(socket, {
      type: 'match.snapshot',
      matchId: match.matchId,
      roomCode: room.roomCode,
      rulesVersion: RULES_VERSION,
      contentHash: CONTENT_HASH,
      mapId: room.settings.mapId,
      turnIndex: match.turnIndex,
      paused: this.isRoomPausedForDisconnect(room),
      lastAckSeqByTeam: { ...match.lastAckSeqByTeam },
      world: serialized,
      worldChecksum,
    });
  }

  private broadcastMatchState(room: RoomRecord, match: ActiveMatchRecord): void {
    const world = match.world;
    const worldChecksum = computeWorldChecksum(world);
    const events = match.pendingEvents.splice(0, match.pendingEvents.length);
    const terrainEdits = match.pendingTerrainEdits.splice(0, match.pendingTerrainEdits.length);
    const paused = this.isRoomPausedForDisconnect(room);

    const stateMsg: ServerMessage = {
      type: 'match.state',
      matchId: match.matchId,
      roomCode: room.roomCode,
      tick: world.tick,
      turnIndex: match.turnIndex,
      phase: world.phase,
      activeTeamId: world.activeTeamId,
      activeCharacterId: world.activeCharacterId,
      turnTicksRemaining: world.turnTicksRemaining,
      wind: world.wind,
      paused,
      terrainRevision: world.terrain.revision,
      terrainChecksum: world.terrain.checksum,
      worldChecksum,
      lastAckSeqByTeam: { ...match.lastAckSeqByTeam },
      teams: world.teams.map((t) => ({ ...t, inventory: { ...t.inventory } })),
      characters: world.characters.map((c) => ({ ...c })),
      projectiles: world.projectiles.map((p) => ({ ...p })),
      events,
      terrainEdits,
    };

    for (const player of room.players) {
      const sess = this.sessionsById.get(player.sessionId);
      this.send(sess?.socket ?? null, stateMsg);
    }
  }

  private broadcastRoomState(room: RoomRecord): void {
    room.lastActivityAtMs = Date.now();
    const publicPlayers: PublicRoomPlayer[] = room.players.map((p) => ({
      sessionId: p.sessionId,
      teamId: p.teamId,
      teamName: p.teamName,
      colorIndex: p.colorIndex,
      hogNames: [...p.hogNames],
      ready: p.ready,
      connected: p.connected,
      disconnectedAtMs: p.disconnectedAtMs,
      forfeited: p.forfeited,
    }));
    const stateMsg: ServerMessage = {
      type: 'room.state',
      roomCode: room.roomCode,
      status: room.status,
      hostSessionId: room.hostSessionId,
      settings: { ...room.settings },
      players: publicPlayers,
      activeMatchId: room.activeMatch?.matchId ?? null,
      pausedForDisconnect: this.isRoomPausedForDisconnect(room),
      pauseRemainingMs: this.getPauseRemainingMs(room),
      lastResults: room.lastResults,
    };
    for (const player of room.players) {
      const sess = this.sessionsById.get(player.sessionId);
      this.send(sess?.socket ?? null, stateMsg);
    }
    this.broadcastRoomsList();
  }

  public closeAll(): void {
    if (this.expirySweepTimer) {
      clearInterval(this.expirySweepTimer);
    }
    for (const room of this.roomsByCode.values()) {
      if (room.activeMatch?.tickTimer) {
        clearInterval(room.activeMatch.tickTimer);
        room.activeMatch.tickTimer = null;
      }
    }
    for (const sess of this.sessionsById.values()) {
      if (sess.disconnectTimer) {
        clearTimeout(sess.disconnectTimer);
        sess.disconnectTimer = null;
      }
    }
    this.roomsByCode.clear();
    this.sessionsById.clear();
    this.sessionsByResumeToken.clear();
    this.sessionsBySocket.clear();
  }
}
