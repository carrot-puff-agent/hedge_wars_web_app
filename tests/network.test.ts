import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createApp } from '../01_hedge_wars/server/src/app';
import {
  CONTENT_HASH,
  PROTOCOL_VERSION,
  RULES_VERSION,
  type ClientMessage,
  type ServerMessage,
} from '../01_hedge_wars/packages/protocol/src/index';
import {
  carveCrater,
  computeWorldChecksum,
  deserializeWorldState,
  type WorldState,
} from '../01_hedge_wars/packages/simulation/src/index';

interface TestClient {
  ws: WebSocket;
  inbox: ServerMessage[];
  sessionId: string;
  resumeToken: string;
  send: (msg: ClientMessage) => void;
  waitFor: <T extends ServerMessage['type']>(
    type: T,
    predicate?: (msg: Extract<ServerMessage, { type: T }>) => boolean,
    timeoutMs?: number,
  ) => Promise<Extract<ServerMessage, { type: T }>>;
  close: () => Promise<void>;
}

async function connectTestClient(
  wsURL: string,
  options: {
    resumeToken?: string;
    protocolVersion?: number;
    rulesVersion?: number;
    contentHash?: string;
  } = {},
): Promise<TestClient> {
  const ws = new WebSocket(wsURL);
  const inbox: ServerMessage[] = [];
  const waiters: Array<{
    type: ServerMessage['type'];
    predicate?: (msg: any) => boolean;
    resolve: (msg: any) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  ws.on('message', (raw) => {
    const parsed = JSON.parse(String(raw)) as ServerMessage;
    for (let i = 0; i < waiters.length; i++) {
      const w = waiters[i]!;
      if (parsed.type === w.type && (!w.predicate || w.predicate(parsed))) {
        clearTimeout(w.timer);
        waiters.splice(i, 1);
        w.resolve(parsed);
        return;
      }
    }
    inbox.push(parsed);
  });

  await once(ws, 'open');

  const waitFor = <T extends ServerMessage['type']>(
    type: T,
    predicate?: (msg: Extract<ServerMessage, { type: T }>) => boolean,
    timeoutMs = 3000,
  ): Promise<Extract<ServerMessage, { type: T }>> => {
    const existingIdx = inbox.findIndex(
      (m) => m.type === type && (!predicate || predicate(m as any)),
    );
    if (existingIdx !== -1) {
      const [found] = inbox.splice(existingIdx, 1);
      return Promise.resolve(found as Extract<ServerMessage, { type: T }>);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = waiters.findIndex((w) => w.timer === timer);
        if (idx !== -1) waiters.splice(idx, 1);
        reject(new Error(`Timeout waiting for ${type}. Inbox: ${inbox.map((m) => m.type).join(',')}`));
      }, timeoutMs);
      waiters.push({ type, predicate, resolve, reject, timer });
    });
  };

  const send = (msg: ClientMessage) => {
    ws.send(JSON.stringify(msg));
  };

  send({
    type: 'client.hello',
    gameId: 'hedge-wars',
    protocolVersion: options.protocolVersion ?? PROTOCOL_VERSION,
    rulesVersion: options.rulesVersion ?? RULES_VERSION,
    contentHash: options.contentHash ?? CONTENT_HASH,
    ...(options.resumeToken ? { resumeToken: options.resumeToken } : {}),
  });

  const hello = await waitFor('server.hello');
  return {
    ws,
    inbox,
    sessionId: hello.sessionId,
    resumeToken: hello.resumeToken,
    send,
    waitFor,
    close: async () => {
      if (ws.readyState === WebSocket.CLOSED) return;
      const closed = once(ws, 'close');
      ws.close();
      await closed;
    },
  };
}

test('NET-02 & NET-08: 2-4 players create/join/configure/ready/start, 5th rejected, rooms isolated, safe logs', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'yizhaklub-net02-'));
  const logs: Record<string, unknown>[] = [];
  const app = createApp({
    root,
    roomOptions: {
      autoTickMatches: false,
      seedOverride: 'net02-seed',
      onLog: (entry) => logs.push(entry),
    },
  });
  context.after(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const wsURL = `ws://127.0.0.1:${address.port}/ws`;

  const clients = await Promise.all([
    connectTestClient(wsURL),
    connectTestClient(wsURL),
    connectTestClient(wsURL),
    connectTestClient(wsURL),
    connectTestClient(wsURL),
    connectTestClient(wsURL),
  ]);
  context.after(async () => {
    await Promise.all(clients.map((c) => c.close()));
  });

  const [c1, c2, c3, c4, c5, otherRoomClient] = clients as [
    TestClient,
    TestClient,
    TestClient,
    TestClient,
    TestClient,
    TestClient,
  ];

  // Host creates room 1
  c1.send({ type: 'room.create', teamName: 'Колючі <script>' });
  const r1Initial = await c1.waitFor('room.state');
  assert.equal(r1Initial.status, 'waiting');
  assert.equal(r1Initial.players.length, 1);
  // HTML brackets are stripped by sanitiser
  assert.equal(r1Initial.players[0]!.teamName, 'Колючі script');
  // No resumeToken is leaked in room.state
  assert.equal('resumeToken' in (r1Initial.players[0] as unknown as Record<string, unknown>), false);

  const roomCode = r1Initial.roomCode;

  // Another client creates a completely separate room 2
  otherRoomClient.send({ type: 'room.create', teamName: 'Інша кімната' });
  const r2State = await otherRoomClient.waitFor('room.state');
  assert.notEqual(r2State.roomCode, roomCode);

  // Clients 2, 3, 4 join room 1
  for (const [idx, client] of [c2, c3, c4].entries()) {
    client.send({ type: 'room.join', roomCode, teamName: `Команда ${idx + 2}` });
    const state = await client.waitFor('room.state', (m) => m.players.length === idx + 2);
    assert.equal(state.roomCode, roomCode);
  }

  // 5th client is rejected with ROOM_FULL
  c5.send({ type: 'room.join', roomCode });
  const errFull = await c5.waitFor('server.error');
  assert.equal(errFull.code, 'ROOM_FULL');
  assert.match(errFull.messageUk, /четверо/i);

  // Non-host cannot change room settings
  c2.send({ type: 'room.configure', turnDurationSeconds: 30 });
  const errNotHost = await c2.waitFor('server.error');
  assert.equal(errNotHost.code, 'NOT_ROOM_HOST');

  // Host configures room settings
  c1.send({
    type: 'room.configure',
    turnDurationSeconds: 30,
    charactersPerTeam: 2,
    initialHealth: 100,
    grenadeAmmo: 3,
  });
  const configuredState = await c1.waitFor(
    'room.state',
    (m) => m.settings.turnDurationSeconds === 30 && m.settings.charactersPerTeam === 2,
  );
  assert.equal(configuredState.settings.grenadeAmmo, 3);

  // Cannot start before all players are ready
  c1.send({ type: 'room.start' });
  const errNotReady = await c1.waitFor('server.error');
  assert.equal(errNotReady.code, 'NOT_READY_TO_START');

  // All 4 players ready up
  for (const client of [c1, c2, c3, c4]) {
    client.send({ type: 'room.ready', ready: true });
  }
  const readyState = await c1.waitFor('room.state', (m) => m.status === 'ready');
  assert.equal(readyState.players.length, 4);

  // Room 2 remained untouched
  assert.equal(otherRoomClient.inbox.some((m) => m.type === 'room.state' && m.roomCode === roomCode), false);

  // Host starts the match
  c1.send({ type: 'room.start' });
  const snaps = await Promise.all([
    c1.waitFor('match.snapshot'),
    c2.waitFor('match.snapshot'),
    c3.waitFor('match.snapshot'),
    c4.waitFor('match.snapshot'),
  ]);
  for (const snap of snaps) {
    assert.equal(snap.roomCode, roomCode);
    assert.equal(snap.world.teams.length, 4);
    assert.equal(snap.world.characters.length, 8);
  }

  // Verify structured logs never contain resumeTokens
  const serializedLogs = JSON.stringify(logs);
  for (const client of [c1, c2, c3, c4, c5]) {
    assert.equal(serializedLogs.includes(client.resumeToken), false);
  }
});

test('NET-03, NET-05, NET-07, GAME-01, GAME-02, GAME-03: 4 clients converge, enforce ownership/order, repair terrain and rematch', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'yizhaklub-net03-'));
  const app = createApp({
    root,
    roomOptions: {
      autoTickMatches: false,
      networkBroadcastEveryTicks: 1,
      seedOverride: 'net03-match-seed',
    },
  });
  context.after(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const wsURL = `ws://127.0.0.1:${address.port}/ws`;

  const [c1, c2, c3, c4] = await Promise.all([
    connectTestClient(wsURL),
    connectTestClient(wsURL),
    connectTestClient(wsURL),
    connectTestClient(wsURL),
  ]);
  context.after(async () => {
    await Promise.all([c1, c2, c3, c4].map((c) => c.close()));
  });

  c1.send({ type: 'room.create', teamName: 'Перші' });
  const created = await c1.waitFor('room.state');
  const roomCode = created.roomCode;

  for (const client of [c2, c3, c4]) {
    client.send({ type: 'room.join', roomCode });
    await client.waitFor('room.state');
  }

  c1.send({
    type: 'room.configure',
    charactersPerTeam: 1,
    initialHealth: 100,
    turnDurationSeconds: 15,
    grenadeAmmo: 1,
  });
  await c1.waitFor('room.state', (m) => m.settings.charactersPerTeam === 1);

  for (const client of [c1, c2, c3, c4]) {
    client.send({ type: 'room.ready', ready: true });
  }
  await c1.waitFor('room.state', (m) => m.status === 'ready');

  c1.send({ type: 'room.start' });
  const [snap1, snap2, snap3, snap4] = await Promise.all([
    c1.waitFor('match.snapshot'),
    c2.waitFor('match.snapshot'),
    c3.waitFor('match.snapshot'),
    c4.waitFor('match.snapshot'),
  ]);

  const matchId = snap1.matchId;
  const snapshotPayloadBytes = Buffer.byteLength(JSON.stringify(snap1), 'utf8');
  assert.ok(snapshotPayloadBytes < 32_768, `Snapshot payload ${snapshotPayloadBytes}B is compact`);

  // Reconstruct local client worlds from initial snapshot
  const clientWorlds: [WorldState, WorldState, WorldState, WorldState] = [
    deserializeWorldState(snap1.world),
    deserializeWorldState(snap2.world),
    deserializeWorldState(snap3.world),
    deserializeWorldState(snap4.world),
  ];

  // Active turn belongs to team-1 (c1). c2 attempting to move or fire is rejected (NET-A02)
  c2.send({
    type: 'match.command',
    matchId,
    commandSeq: 1,
    action: { kind: 'move', direction: 1 },
  });
  const ackWrongTurn = await c2.waitFor('match.command_ack');
  assert.equal(ackWrongTurn.accepted, false);
  assert.equal(ackWrongTurn.reason, 'NOT_YOUR_TURN');

  // c1 sends valid move & aim commands, then duplicate commandSeq is rejected
  c1.send({
    type: 'match.command',
    matchId,
    commandSeq: 1,
    action: { kind: 'move', direction: 1 },
  });
  const ackMove = await c1.waitFor('match.command_ack', (m) => m.commandSeq === 1);
  assert.equal(ackMove.accepted, true);

  c1.send({
    type: 'match.command',
    matchId,
    commandSeq: 1,
    action: { kind: 'move', direction: -1 },
  });
  const ackStale = await c1.waitFor('match.command_ack', (m) => !m.accepted);
  assert.equal(ackStale.reason, 'STALE_COMMAND');

  // Step 5 ticks of walking
  app.rooms.stepRoomTicks(roomCode, 5);

  // c1 fires a rocket onto the central hill to carve a crater
  c1.send({
    type: 'match.command',
    matchId,
    commandSeq: 2,
    action: { kind: 'fire', weapon: 'rocket', angleDeg: 35, facing: 1, power: 400 },
  });
  const ackFire = await c1.waitFor('match.command_ack', (m) => m.commandSeq === 2);
  assert.equal(ackFire.accepted, true);

  // Attempting to fire a second time in the same turn is rejected with INVALID_PHASE once resolving
  app.rooms.stepRoomTicks(roomCode, 1);
  c1.send({
    type: 'match.command',
    matchId,
    commandSeq: 3,
    action: { kind: 'fire', weapon: 'rocket', angleDeg: 0, power: 300 },
  });
  const ackInvalidPhase = await c1.waitFor('match.command_ack', (m) => m.commandSeq === 3);
  assert.equal(ackInvalidPhase.accepted, false);
  assert.equal(ackInvalidPhase.reason, 'INVALID_PHASE');

  // Step until turn 0 resolves and transitions to turnIndex === 1 (team-2)
  const tickStart = performance.now();
  let stepsRun = 0;
  while (app.rooms.getRoom(roomCode)?.activeMatch?.turnIndex === 0 && stepsRun < 360) {
    app.rooms.stepRoomTicks(roomCode, 1);
    stepsRun++;
  }
  const avgServerTickMs = (performance.now() - tickStart) / Math.max(1, stepsRun);
  assert.ok(avgServerTickMs < 4, `Server tick averaged ${avgServerTickMs.toFixed(3)}ms`);

  // Flush WebSocket stream on all 4 clients using ping/pong barrier
  for (const client of [c1, c2, c3, c4]) {
    client.send({ type: 'client.ping', clientTimeMs: 1 });
  }
  await Promise.all([c1, c2, c3, c4].map((client) => client.waitFor('server.pong')));

  // Apply all received match.state messages on clients 1..4
  let stateDeltaBytes = 0;
  for (const [idx, client] of [c1, c2, c3, c4].entries()) {
    const localWorld = clientWorlds[idx]!;
    for (const msg of client.inbox) {
      if (msg.type === 'match.state') {
        stateDeltaBytes = Math.max(stateDeltaBytes, Buffer.byteLength(JSON.stringify(msg), 'utf8'));
        for (const edit of msg.terrainEdits) {
          assert.equal(
            edit.previousRevision,
            localWorld.terrain.revision,
            'Sequential terrain revision matches',
          );
          carveCrater(localWorld.terrain, edit.x, edit.y, edit.radius);
          assert.equal(localWorld.terrain.revision, edit.revision);
          assert.equal(localWorld.terrain.checksum, edit.checksum);
        }
        localWorld.tick = msg.tick;
        localWorld.rngState = app.rooms.getRoom(roomCode)!.activeMatch!.world.rngState;
        localWorld.wind = msg.wind;
        localWorld.turnTicksRemaining = msg.turnTicksRemaining;
        localWorld.phase = msg.phase;
        localWorld.activeTeamId = msg.activeTeamId;
        localWorld.activeCharacterId = msg.activeCharacterId;
        localWorld.teams = msg.teams;
        localWorld.characters = msg.characters;
        localWorld.projectiles = msg.projectiles;
      }
    }
    client.inbox.length = 0;
  }

  // Verify all 4 clients converged to identical terrain revision, checksum and worldChecksum (NET-A03)
  const serverWorld = app.rooms.getRoom(roomCode)!.activeMatch!.world;
  const serverWorldChecksum = computeWorldChecksum(serverWorld);
  assert.ok(serverWorld.terrain.revision > 0, 'Crater incremented terrain revision');
  assert.equal(serverWorld.activeTeamId, 'team-2', 'Turn advanced to team-2 after settlement');

  for (const localWorld of clientWorlds) {
    assert.equal(localWorld.terrain.revision, serverWorld.terrain.revision);
    assert.equal(localWorld.terrain.checksum, serverWorld.terrain.checksum);
    assert.equal(computeWorldChecksum(localWorld), serverWorldChecksum);
  }

  // NET-05 / NET-A05: Simulate dropped terrain update on client 3 and recover via match.request_snapshot
  clientWorlds[2].terrain.revision = 0;
  clientWorlds[2].terrain.mask.fill(0);
  c3.send({
    type: 'match.request_snapshot',
    matchId,
    knownTerrainRevision: 0,
    reason: 'revision_gap',
  });
  const repairSnap = await c3.waitFor('match.snapshot');
  clientWorlds[2] = deserializeWorldState(repairSnap.world);
  assert.equal(clientWorlds[2].terrain.revision, serverWorld.terrain.revision);
  assert.equal(clientWorlds[2].terrain.checksum, serverWorld.terrain.checksum);
  assert.equal(computeWorldChecksum(clientWorlds[2]), serverWorldChecksum);

  // Eliminate teams 2, 3, 4 (via leave/forfeit) to verify match victory and rematch (GAME-01, GAME-03)
  for (const client of [c2, c3, c4]) {
    client.send({ type: 'room.leave' });
    await client.waitFor('room.left');
  }

  const resultsMsg = await c1.waitFor('match.results');
  assert.equal(resultsMsg.results.winnerTeamId, 'team-1');
  assert.match(resultsMsg.results.headlineUk, /Перемагає команда/);

  const resultsRoomState = await c1.waitFor('room.state', (m) => m.status === 'results');
  assert.equal(resultsRoomState.activeMatchId, null);

  // c2 Rejoins and they trigger a rematch (GAME-03)
  c2.send({ type: 'room.join', roomCode, teamName: 'Повернення' });
  await c2.waitFor('room.state');
  c1.send({ type: 'room.rematch' });
  const rematchState = await c1.waitFor('room.state', (m) => m.status === 'ready');
  assert.equal(rematchState.players.length, 2);

  c1.send({ type: 'room.start' });
  const rematchSnap = await c1.waitFor('match.snapshot');
  assert.notEqual(rematchSnap.matchId, matchId);
  assert.equal(rematchSnap.world.teams.length, 2);
});

test('NET-04 & NET-06: heartbeat, disconnect input release, pause/reconnect grace and version mismatch rejection', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'yizhaklub-net04-'));
  const app = createApp({
    root,
    roomOptions: {
      autoTickMatches: false,
      reconnectGraceMs: 60_000,
      seedOverride: 'net04-seed',
    },
  });
  context.after(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const wsURL = `ws://127.0.0.1:${address.port}/ws`;

  // NET-06: Incompatible rulesVersion or contentHash is rejected on hello with Ukrainian feedback
  const badRulesWs = new WebSocket(wsURL);
  await once(badRulesWs, 'open');
  const badRulesMsgPromise = once(badRulesWs, 'message');
  badRulesWs.send(
    JSON.stringify({
      type: 'client.hello',
      gameId: 'hedge-wars',
      protocolVersion: PROTOCOL_VERSION,
      rulesVersion: RULES_VERSION + 99,
      contentHash: CONTENT_HASH,
    }),
  );
  const [rawBadRules] = await badRulesMsgPromise;
  const badRulesErr = JSON.parse(String(rawBadRules));
  assert.equal(badRulesErr.code, 'RULES_MISMATCH');
  assert.equal(badRulesErr.requiresReload, true);
  assert.match(badRulesErr.messageUk, /Правила гри оновилися/);

  const badContentWs = new WebSocket(wsURL);
  await once(badContentWs, 'open');
  const badContentMsgPromise = once(badContentWs, 'message');
  badContentWs.send(
    JSON.stringify({
      type: 'client.hello',
      gameId: 'hedge-wars',
      protocolVersion: PROTOCOL_VERSION,
      rulesVersion: RULES_VERSION,
      contentHash: 'stale-map-hash',
    }),
  );
  const [rawBadContent] = await badContentMsgPromise;
  const badContentErr = JSON.parse(String(rawBadContent));
  assert.equal(badContentErr.code, 'CONTENT_MISMATCH');
  assert.equal(badContentErr.requiresReload, true);

  // Connect two valid clients
  const c1 = await connectTestClient(wsURL);
  const c2 = await connectTestClient(wsURL);
  context.after(async () => {
    await c1.close();
    await c2.close();
  });

  // Heartbeat check
  c1.send({ type: 'client.ping', clientTimeMs: 123456 });
  const pong = await c1.waitFor('server.pong');
  assert.equal(pong.clientTimeMs, 123456);

  c1.send({ type: 'room.create' });
  const roomCode = (await c1.waitFor('room.state')).roomCode;
  c2.send({ type: 'room.join', roomCode });
  await c2.waitFor('room.state');

  c1.send({ type: 'room.ready', ready: true });
  c2.send({ type: 'room.ready', ready: true });
  await c1.waitFor('room.state', (m) => m.status === 'ready');

  c1.send({ type: 'room.start' });
  const snap = await c1.waitFor('match.snapshot');
  await c2.waitFor('match.snapshot');
  const matchId = snap.matchId;

  // c1 holds right movement
  c1.send({
    type: 'match.command',
    matchId,
    commandSeq: 1,
    action: { kind: 'move', direction: 1 },
  });
  await c1.waitFor('match.command_ack');
  app.rooms.stepRoomTicks(roomCode, 1);

  const activeChar = app.rooms
    .getRoom(roomCode)!
    .activeMatch!.world.characters.find((c) => c.id === 'team-1-hog-1')!;
  assert.equal(activeChar.moveInput, 1);

  // Disconnect c1 abruptly: held moveInput must be cleared immediately and room pauses
  const savedResumeToken = c1.resumeToken;
  const savedSessionId = c1.sessionId;
  await c1.close();

  const pausedRoomState = await c2.waitFor('room.state', (m) => m.pausedForDisconnect);
  assert.equal(pausedRoomState.pausedForDisconnect, true);
  assert.equal(activeChar.moveInput, 0, 'Disconnect immediately cleared held movement input');

  const tickBeforePauseStep = app.rooms.getRoom(roomCode)!.activeMatch!.world.tick;
  app.rooms.stepRoomTicks(roomCode, 10);
  assert.equal(
    app.rooms.getRoom(roomCode)!.activeMatch!.world.tick,
    tickBeforePauseStep,
    'Simulation does not advance while paused for disconnect',
  );

  // Reconnect c1 using its secret resumeToken
  const c1Resumed = await connectTestClient(wsURL, { resumeToken: savedResumeToken });
  context.after(async () => {
    await c1Resumed.close();
  });
  assert.equal(c1Resumed.sessionId, savedSessionId);
  const resumedSnap = await c1Resumed.waitFor('match.snapshot');
  assert.equal(resumedSnap.matchId, matchId);
  assert.equal(resumedSnap.lastAckSeqByTeam['team-1'], 1);

  const unpausedState = await c2.waitFor('room.state', (m) => !m.pausedForDisconnect);
  assert.equal(unpausedState.pausedForDisconnect, false);
});
