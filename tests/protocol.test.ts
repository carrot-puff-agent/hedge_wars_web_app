import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClientMessage, PROTOCOL_VERSION, ServerMessage } from '../01_hedge_wars/packages/protocol/src/index';

test('contract accepts hello only, with no room privileges implied', () => {
  assert.equal(ClientMessage.safeParse({ type: 'client.hello', gameId: 'hedge-wars', protocolVersion: PROTOCOL_VERSION }).success, true);
  assert.equal(ClientMessage.safeParse({ type: 'client.hello', gameId: 'hedge-wars', protocolVersion: PROTOCOL_VERSION, health: 999 }).success, false);
  assert.equal(ClientMessage.safeParse({ type: 'fire', gameId: 'hedge-wars', protocolVersion: PROTOCOL_VERSION }).success, false);
  assert.equal(ServerMessage.safeParse({ type: 'server.hello', gameId: 'hedge-wars', protocolVersion: PROTOCOL_VERSION, serverVersion: '0.1.0', capabilities: [] }).success, true);
});
