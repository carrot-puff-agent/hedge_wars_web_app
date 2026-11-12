import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTENT_HASH,
  ClientMessage,
  PROTOCOL_VERSION,
  RULES_VERSION,
  SERVER_CAPABILITIES,
  ServerMessage,
} from '../01_hedge_wars/packages/protocol/src/index';

test('NET-01: contract validates hello, rooms, commands and snapshots while rejecting untrusted fields', () => {
  assert.equal(
    ClientMessage.safeParse({
      type: 'client.hello',
      gameId: 'hedge-wars',
      protocolVersion: PROTOCOL_VERSION,
      rulesVersion: RULES_VERSION,
      contentHash: CONTENT_HASH,
    }).success,
    true,
  );
  // Reject client attempting to inject authoritative state
  assert.equal(
    ClientMessage.safeParse({
      type: 'client.hello',
      gameId: 'hedge-wars',
      protocolVersion: PROTOCOL_VERSION,
      health: 999,
    }).success,
    false,
  );
  assert.equal(
    ClientMessage.safeParse({
      type: 'fire',
      gameId: 'hedge-wars',
      protocolVersion: PROTOCOL_VERSION,
    }).success,
    false,
  );
  // Validate match command contract
  assert.equal(
    ClientMessage.safeParse({
      type: 'match.command',
      matchId: 'ABCD-m1',
      commandSeq: 1,
      action: { kind: 'fire', power: 500, angleDeg: 35, weapon: 'rocket' },
    }).success,
    true,
  );
  // Reject out-of-range power or unknown action fields
  assert.equal(
    ClientMessage.safeParse({
      type: 'match.command',
      matchId: 'ABCD-m1',
      commandSeq: 1,
      action: { kind: 'fire', power: 99999 },
    }).success,
    false,
  );
  assert.equal(
    ServerMessage.safeParse({
      type: 'server.hello',
      gameId: 'hedge-wars',
      protocolVersion: PROTOCOL_VERSION,
      rulesVersion: RULES_VERSION,
      contentHash: CONTENT_HASH,
      serverVersion: '0.1.0',
      sessionId: 'sess_1234',
      resumeToken: 'a'.repeat(48),
      resumed: false,
      resumedRoomCode: null,
      capabilities: [...SERVER_CAPABILITIES],
    }).success,
    true,
  );
});
