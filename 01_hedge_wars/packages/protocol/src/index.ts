import { z } from 'zod';

export const PROTOCOL_VERSION = 2;
export const RULES_VERSION = 1;
export const CONTENT_HASH = 'meadow-boulders-v1-2048x1024';
export const DEFAULT_MAP_ID = 'meadow-boulders';
export const MAX_MESSAGE_BYTES = 16_384;

export const MIN_ROOM_PLAYERS = 2;
export const MAX_ROOM_PLAYERS = 8;
export const DEFAULT_RECONNECT_GRACE_MS = 120_000;
export const DEFAULT_ROOM_IDLE_EXPIRY_MS = 300_000;

export const SERVER_CAPABILITIES = [
  'sessions',
  'rooms',
  'authoritative-match',
  'terrain-sync',
  'reconnect',
] as const;

export const ErrorCode = z.enum([
  'INVALID_MESSAGE',
  'PROTOCOL_MISMATCH',
  'RULES_MISMATCH',
  'CONTENT_MISMATCH',
  'HELLO_REQUIRED',
  'SESSION_EXPIRED',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'ROOM_ALREADY_STARTED',
  'ALREADY_IN_ROOM',
  'NOT_IN_ROOM',
  'NOT_ROOM_HOST',
  'NOT_READY_TO_START',
  'MATCH_NOT_ACTIVE',
  'NOT_YOUR_TURN',
  'UNAUTHORIZED_TEAM',
  'STALE_COMMAND',
  'INVALID_PHASE',
  'OUT_OF_AMMO',
  'RATE_LIMITED',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ERROR_MESSAGES_UK: Record<ErrorCode, string> = {
  INVALID_MESSAGE: 'Не вдалося розпізнати команду. Спробуй ще раз!',
  PROTOCOL_MISMATCH: 'Є новіша версія гри. Онови сторінку, будь ласка.',
  RULES_MISMATCH: 'Правила гри оновилися. Перезавантаж сторінку перед боєм.',
  CONTENT_MISMATCH: 'Мапа гри оновилася. Онови сторінку, щоб грати далі.',
  HELLO_REQUIRED: 'Спочатку треба привітатися з сервером.',
  SESSION_EXPIRED: 'Попередня ігрова сесія завершилася. Почнімо нову пригоду!',
  ROOM_NOT_FOUND: 'Такої кімнати не знайдено. Перевір код кімнати.',
  ROOM_FULL: 'У кімнаті вже максимум гравців — вільних місць немає.',
  ROOM_ALREADY_STARTED: 'Бій у цій кімнаті вже триває.',
  ALREADY_IN_ROOM: 'Ти вже перебуваєш у кімнаті.',
  NOT_IN_ROOM: 'Ти ще не приєднався до кімнати.',
  NOT_ROOM_HOST: 'Тільки господар кімнати може змінювати це налаштування.',
  NOT_READY_TO_START: 'Потрібно щонайменше двоє готових гравців для старту.',
  MATCH_NOT_ACTIVE: 'Зараз немає активного бою.',
  NOT_YOUR_TURN: 'Зачекай свого ходу — зараз діє інша команда.',
  UNAUTHORIZED_TEAM: 'Керувати можна лише власною командою їжачків.',
  STALE_COMMAND: 'Ця команда вже застаріла або була виконана.',
  INVALID_PHASE: 'Цю дію не можна виконати в поточній фазі ходу.',
  OUT_OF_AMMO: 'Запас цієї зброї вичерпано!',
  RATE_LIMITED: 'Забагато команд поспіль — зачекай мить.',
};

export const TEAM_PRESETS_UK = [
  {
    name: 'Колючі мандрівники',
    colorIndex: 0,
    symbol: '●',
    hex: '#8ec922',
    hogs: ['Бодя', 'Хрум', 'Шпилька', 'Жолудь'],
  },
  {
    name: 'Лісові бешкетники',
    colorIndex: 1,
    symbol: '▲',
    hex: '#3094f0',
    hogs: ['Пихтик', 'Іскра', 'Каштан', 'Вітерець'],
  },
  {
    name: 'Сонячні каштани',
    colorIndex: 2,
    symbol: '■',
    hex: '#e8523a',
    hogs: ['Зірко', 'Бублик', 'Росинка', 'Туман'],
  },
  {
    name: 'Мохові вартові',
    colorIndex: 3,
    symbol: '◆',
    hex: '#9c56e8',
    hogs: ['Мохнач', 'Шишка', 'Промінь', 'Листок'],
  },
  {
    name: 'Золоті промені',
    colorIndex: 4,
    symbol: '★',
    hex: '#ebb41e',
    hogs: ['Промінчик', 'Сонях', 'Медок', 'Бурштин'],
  },
  {
    name: 'Морські хвилі',
    colorIndex: 5,
    symbol: '✦',
    hex: '#1ab8a0',
    hogs: ['Хвилька', 'Мушля', 'Бриз', 'Корал'],
  },
  {
    name: 'Малинові іскри',
    colorIndex: 6,
    symbol: '♥',
    hex: '#e04896',
    hogs: ['Малинка', 'Ягідка', 'Квітка', 'Зірочка'],
  },
  {
    name: 'Бурштинові лиси',
    colorIndex: 7,
    symbol: '☀',
    hex: '#f27d24',
    hogs: ['Вогник', 'Рудик', 'Горішок', 'Клен'],
  },
  {
    name: 'Грозові хмари',
    colorIndex: 8,
    symbol: '⬢',
    hex: '#485ce0',
    hogs: ['Грім', 'Вихор', 'Хмарка', 'Блискавка'],
  },
  {
    name: 'Рубінові шишки',
    colorIndex: 9,
    symbol: '❖',
    hex: '#b52b47',
    hogs: ['Рубін', 'Калина', 'Гранат', 'Жар'],
  },
] as const;

export function sanitiseDisplayName(raw: string | undefined, fallback: string, maxLength = 24): string {
  if (!raw) return fallback;
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F-\u009F<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return cleaned.length > 0 ? cleaned : fallback;
}

export function sanitiseRoomCode(raw: string): string {
  return raw
    .replace(/[^0-9A-Za-zА-ЯІЇЄҐа-яіїєґ]/g, '')
    .toUpperCase()
    .slice(0, 8);
}

export const MatchCommandAction = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('move'),
    direction: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  }).strict(),
  z.object({
    kind: z.literal('aim'),
    angleDeg: z.number().min(-90).max(90),
    facing: z.union([z.literal(-1), z.literal(1)]).optional(),
  }).strict(),
  z.object({
    kind: z.literal('jump'),
    jumpKind: z.enum(['long', 'high']),
    facing: z.union([z.literal(-1), z.literal(1)]).optional(),
  }).strict(),
  z.object({
    kind: z.literal('skipTurn'),
  }).strict(),
  z.object({
    kind: z.literal('selectWeapon'),
    weapon: z.enum(['rocket', 'grenade']),
    grenadeFuseSeconds: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
      .optional(),
  }).strict(),
  z.object({
    kind: z.literal('fire'),
    power: z.number().min(50).max(1000),
    angleDeg: z.number().min(-90).max(90).optional(),
    facing: z.union([z.literal(-1), z.literal(1)]).optional(),
    weapon: z.enum(['rocket', 'grenade']).optional(),
    grenadeFuseSeconds: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
      .optional(),
  }).strict(),
]);
export type MatchCommandAction = z.infer<typeof MatchCommandAction>;

export const ClientMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('client.hello'),
    protocolVersion: z.number().int().nonnegative(),
    gameId: z.literal('hedge-wars'),
    rulesVersion: z.number().int().nonnegative().optional(),
    contentHash: z.string().min(1).max(128).optional(),
    resumeToken: z.string().min(16).max(128).optional(),
  }).strict(),
  z.object({
    type: z.literal('client.ping'),
    clientTimeMs: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    type: z.literal('room.list'),
  }).strict(),
  z.object({
    type: z.literal('room.create'),
    teamName: z.string().min(1).max(40).optional(),
    colorIndex: z.number().int().min(0).max(9).optional(),
    hogNames: z.array(z.string().min(1).max(24)).min(1).max(4).optional(),
  }).strict(),
  z.object({
    type: z.literal('room.join'),
    roomCode: z.string().min(4).max(8),
    teamName: z.string().min(1).max(40).optional(),
    colorIndex: z.number().int().min(0).max(9).optional(),
    hogNames: z.array(z.string().min(1).max(24)).min(1).max(4).optional(),
  }).strict(),
  z.object({
    type: z.literal('room.leave'),
  }).strict(),
  z.object({
    type: z.literal('room.configure_team'),
    teamName: z.string().min(1).max(40).optional(),
    colorIndex: z.number().int().min(0).max(9).optional(),
    hogNames: z.array(z.string().min(1).max(24)).min(1).max(4).optional(),
  }).strict(),
  z.object({
    type: z.literal('room.configure'),
    turnDurationSeconds: z.number().int().min(15).max(90).optional(),
    charactersPerTeam: z.number().int().min(1).max(4).optional(),
    initialHealth: z.number().int().min(50).max(200).optional(),
    rocketAmmo: z.number().int().min(1).max(99).optional(),
    grenadeAmmo: z.number().int().min(0).max(99).optional(),
    disconnectPolicy: z.enum(['pause', 'forfeit_on_timeout']).optional(),
    mapId: z.literal('meadow-boulders').optional(),
  }).strict(),
  z.object({
    type: z.literal('room.ready'),
    ready: z.boolean(),
  }).strict(),
  z.object({
    type: z.literal('room.start'),
  }).strict(),
  z.object({
    type: z.literal('room.rematch'),
  }).strict(),
  z.object({
    type: z.literal('match.command'),
    matchId: z.string().min(1).max(64),
    commandSeq: z.number().int().positive(),
    action: MatchCommandAction,
  }).strict(),
  z.object({
    type: z.literal('match.release_inputs'),
    matchId: z.string().min(1).max(64),
    reason: z.enum(['blur', 'visibility', 'touch_cancel', 'manual']).optional(),
  }).strict(),
  z.object({
    type: z.literal('match.request_snapshot'),
    matchId: z.string().min(1).max(64),
    knownTerrainRevision: z.number().int().nonnegative().optional(),
    reason: z.enum(['join', 'reconnect', 'revision_gap', 'checksum_mismatch']).optional(),
  }).strict(),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export const RoomSettingsSchema = z.object({
  turnDurationSeconds: z.number().int().min(15).max(90),
  charactersPerTeam: z.number().int().min(1).max(4),
  initialHealth: z.number().int().min(50).max(200),
  rocketAmmo: z.number().int().min(1).max(99),
  grenadeAmmo: z.number().int().min(0).max(99),
  disconnectPolicy: z.enum(['pause', 'forfeit_on_timeout']),
  mapId: z.literal('meadow-boulders'),
}).strict();
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export const PublicRoomPlayerSchema = z.object({
  sessionId: z.string(),
  teamId: z.string(),
  teamName: z.string(),
  colorIndex: z.number().int().min(0).max(9),
  hogNames: z.array(z.string()),
  ready: z.boolean(),
  connected: z.boolean(),
  disconnectedAtMs: z.number().int().nullable(),
  forfeited: z.boolean(),
}).strict();
export type PublicRoomPlayer = z.infer<typeof PublicRoomPlayerSchema>;

export const DirtyRectSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
}).strict();

export const TerrainCraterEditSchema = z.object({
  sequence: z.number().int().positive(),
  previousRevision: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  x: z.number().int(),
  y: z.number().int(),
  radius: z.number().int().nonnegative(),
  clearedCells: z.number().int().nonnegative(),
  checksum: z.number().int().nonnegative(),
  dirtyChunks: z.array(DirtyRectSchema),
}).strict();
export type TerrainCraterEdit = z.infer<typeof TerrainCraterEditSchema>;

export const TeamInventorySchema = z.object({
  rocket: z.number().int().nonnegative(),
  grenade: z.number().int().nonnegative(),
}).strict();

export const TeamStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  colorIndex: z.number().int().min(0).max(9),
  inventory: TeamInventorySchema,
}).strict();

export const CharacterStateSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  vx: z.number(),
  vy: z.number(),
  radius: z.number(),
  health: z.number().int(),
  alive: z.boolean(),
  drowning: z.boolean(),
  grounded: z.boolean(),
  jumping: z.enum(['none', 'long', 'high']),
  facing: z.union([z.literal(-1), z.literal(1)]),
  aimAngleDeg: z.number(),
  moveInput: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  stepCooldownTicks: z.number().int(),
  selectedWeapon: z.enum(['rocket', 'grenade']),
  grenadeFuseTicks: z.number().int(),
  lastDamagedByTeamId: z.string().nullable(),
}).strict();

export const ProjectileStateSchema = z.object({
  id: z.string(),
  kind: z.enum(['rocket', 'grenade']),
  ownerTeamId: z.string(),
  ownerCharacterId: z.string(),
  x: z.number(),
  y: z.number(),
  vx: z.number(),
  vy: z.number(),
  radius: z.number(),
  boomRadius: z.number(),
  density: z.number(),
  elasticity: z.number(),
  friction: z.number(),
  fuseTicksRemaining: z.number().int().nullable(),
  bounces: z.number().int(),
  active: z.boolean(),
  leftOwnerGrace: z.boolean(),
}).strict();

export const SerializedTerrainStateSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  waterLine: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  checksum: z.number().int().nonnegative(),
  rleMask: z.array(z.number().int().nonnegative()),
  dirtyChunks: z.array(DirtyRectSchema),
}).strict();

export const TurnPhaseSchema = z.enum(['select', 'control', 'resolve', 'settle', 'finished']);

export const SerializedWorldStateSchema = z.object({
  rulesVersion: z.number().int().positive(),
  tick: z.number().int().nonnegative(),
  rngState: z.number().int().nonnegative(),
  wind: z.number(),
  activeTeamId: z.string().nullable(),
  activeCharacterId: z.string().nullable(),
  turnTicksRemaining: z.number().int().nonnegative(),
  phase: TurnPhaseSchema,
  winnerTeamId: z.string().nullable(),
  nextEntitySeq: z.number().int().positive(),
  terrain: SerializedTerrainStateSchema,
  teams: z.array(TeamStateSchema),
  characters: z.array(CharacterStateSchema),
  projectiles: z.array(ProjectileStateSchema),
}).strict();

export const SimulationEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('wind.changed'), tick: z.number().int(), wind: z.number() }).strict(),
  z.object({
    type: z.literal('character.moved'),
    tick: z.number().int(),
    characterId: z.string(),
    x: z.number(),
    y: z.number(),
  }).strict(),
  z.object({
    type: z.literal('character.jumped'),
    tick: z.number().int(),
    characterId: z.string(),
    kind: z.enum(['long', 'high']),
  }).strict(),
  z.object({
    type: z.literal('character.damaged'),
    tick: z.number().int(),
    characterId: z.string(),
    amount: z.number().int(),
    health: z.number().int(),
    cause: z.enum(['explosion', 'fall']),
  }).strict(),
  z.object({
    type: z.literal('character.drowned'),
    tick: z.number().int(),
    characterId: z.string(),
  }).strict(),
  z.object({
    type: z.literal('character.eliminated'),
    tick: z.number().int(),
    characterId: z.string(),
    cause: z.enum(['explosion', 'fall', 'water']),
  }).strict(),
  z.object({
    type: z.literal('projectile.spawned'),
    tick: z.number().int(),
    projectileId: z.string(),
    kind: z.enum(['rocket', 'grenade']),
    x: z.number(),
    y: z.number(),
  }).strict(),
  z.object({
    type: z.literal('projectile.bounced'),
    tick: z.number().int(),
    projectileId: z.string(),
    x: z.number(),
    y: z.number(),
    bounces: z.number().int(),
  }).strict(),
  z.object({
    type: z.literal('explosion'),
    tick: z.number().int(),
    x: z.number().int(),
    y: z.number().int(),
    radius: z.number().int(),
    clearedCells: z.number().int(),
    terrainRevision: z.number().int(),
  }).strict(),
  z.object({
    type: z.literal('world.settled'),
    tick: z.number().int(),
  }).strict(),
]);

export const StandingEntrySchema = z.object({
  teamId: z.string(),
  teamName: z.string(),
  colorIndex: z.number().int().min(0).max(9),
  survivingHogs: z.number().int().nonnegative(),
  totalHealth: z.number().int().nonnegative(),
  forfeited: z.boolean(),
}).strict();
export type StandingEntry = z.infer<typeof StandingEntrySchema>;

export const MatchResultsSummarySchema = z.object({
  matchId: z.string(),
  roomCode: z.string(),
  winnerTeamId: z.string().nullable(),
  winnerTeamName: z.string().nullable(),
  headlineUk: z.string(),
  subtitleUk: z.string(),
  turnsPlayed: z.number().int().nonnegative(),
  totalTicks: z.number().int().nonnegative(),
  standings: z.array(StandingEntrySchema),
}).strict();
export type MatchResultsSummary = z.infer<typeof MatchResultsSummarySchema>;

export const PublicRoomSummarySchema = z.object({
  roomCode: z.string(),
  hostName: z.string(),
  colorIndex: z.number().int().min(0).max(9),
  playerCount: z.number().int().min(1).max(MAX_ROOM_PLAYERS),
  maxPlayers: z.number().int().min(2).max(MAX_ROOM_PLAYERS),
  status: z.enum(['waiting', 'ready', 'playing', 'results']),
  expiresInSeconds: z.number().int().nonnegative(),
}).strict();
export type PublicRoomSummary = z.infer<typeof PublicRoomSummarySchema>;

export const ServerMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('rooms.list'),
    rooms: z.array(PublicRoomSummarySchema),
  }).strict(),
  z.object({
    type: z.literal('server.hello'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    rulesVersion: z.literal(RULES_VERSION),
    contentHash: z.literal(CONTENT_HASH),
    gameId: z.literal('hedge-wars'),
    serverVersion: z.string(),
    sessionId: z.string(),
    resumeToken: z.string(),
    resumed: z.boolean(),
    resumedRoomCode: z.string().nullable(),
    capabilities: z.array(z.string()),
  }).strict(),
  z.object({
    type: z.literal('server.pong'),
    clientTimeMs: z.number().int().nonnegative(),
    serverTimeMs: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    type: z.literal('server.error'),
    code: ErrorCode,
    messageUk: z.string(),
    requiresReload: z.boolean().optional(),
  }).strict(),
  z.object({
    type: z.literal('room.state'),
    roomCode: z.string(),
    status: z.enum(['waiting', 'ready', 'playing', 'results', 'closed']),
    hostSessionId: z.string(),
    settings: RoomSettingsSchema,
    players: z.array(PublicRoomPlayerSchema),
    activeMatchId: z.string().nullable(),
    pausedForDisconnect: z.boolean(),
    pauseRemainingMs: z.number().int().nonnegative().nullable(),
    lastResults: MatchResultsSummarySchema.nullable(),
  }).strict(),
  z.object({
    type: z.literal('room.left'),
    roomCode: z.string(),
    reason: z.enum(['voluntary', 'closed', 'expired']),
  }).strict(),
  z.object({
    type: z.literal('match.snapshot'),
    matchId: z.string(),
    roomCode: z.string(),
    rulesVersion: z.number().int().positive(),
    contentHash: z.string(),
    mapId: z.string(),
    turnIndex: z.number().int().nonnegative(),
    paused: z.boolean(),
    lastAckSeqByTeam: z.record(z.string(), z.number().int().nonnegative()),
    world: SerializedWorldStateSchema,
    worldChecksum: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    type: z.literal('match.state'),
    matchId: z.string(),
    roomCode: z.string(),
    tick: z.number().int().nonnegative(),
    turnIndex: z.number().int().nonnegative(),
    phase: TurnPhaseSchema,
    activeTeamId: z.string().nullable(),
    activeCharacterId: z.string().nullable(),
    turnTicksRemaining: z.number().int().nonnegative(),
    wind: z.number(),
    paused: z.boolean(),
    terrainRevision: z.number().int().nonnegative(),
    terrainChecksum: z.number().int().nonnegative(),
    worldChecksum: z.number().int().nonnegative(),
    lastAckSeqByTeam: z.record(z.string(), z.number().int().nonnegative()),
    teams: z.array(TeamStateSchema),
    characters: z.array(CharacterStateSchema),
    projectiles: z.array(ProjectileStateSchema),
    events: z.array(SimulationEventSchema),
    terrainEdits: z.array(TerrainCraterEditSchema),
  }).strict(),
  z.object({
    type: z.literal('match.command_ack'),
    matchId: z.string(),
    commandSeq: z.number().int().positive(),
    accepted: z.boolean(),
    tick: z.number().int().nonnegative(),
    reason: ErrorCode.optional(),
  }).strict(),
  z.object({
    type: z.literal('match.results'),
    results: MatchResultsSummarySchema,
  }).strict(),
]);

export type ServerMessage = z.infer<typeof ServerMessage>;
