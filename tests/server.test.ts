import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createApp } from '../01_hedge_wars/server/src/app';
import {
  CONTENT_HASH,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  RULES_VERSION,
  SERVER_CAPABILITIES,
} from '../01_hedge_wars/packages/protocol/src/index';

test('origin serves both builds and validates real WebSocket boundaries', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'yizhaklub-'));
  const app = createApp({ root });
  context.after(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });
  for (const [directory, title] of [
    ['hub/dist', 'hub'],
    ['01_hedge_wars/client/dist', 'game'],
  ]) {
    await mkdir(join(root, directory!), { recursive: true });
    await writeFile(join(root, directory!, 'index.html'), title!);
  }
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.stage, 'foundation');
  assert.equal(health.protocolVersion, PROTOCOL_VERSION);
  assert.equal(health.rulesVersion, RULES_VERSION);
  assert.equal(health.contentHash, CONTENT_HASH);
  assert.equal((await (await fetch(`${base}/api/games`)).json())[0].id, 'hedge-wars');
  assert.equal(await (await fetch(base)).text(), 'hub');
  assert.equal(await (await fetch(`${base}/games/hedge-wars/`)).text(), 'game');
  assert.equal((await fetch(`${base}/games/hedge-wars`, { redirect: 'manual' })).status, 308);
  assert.equal((await fetch(`${base}/games/unknown/`)).status, 404);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
  assert.equal((await fetch(`${base}/%ZZ`)).status, 400);
  assert.equal((await fetch(`${base}/api/health`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(base, { method: 'HEAD' })).headers.get('content-type'), 'text/html; charset=utf-8');

  const wsURL = `${base.replace('http:', 'ws:')}/ws`;
  const client = new WebSocket(wsURL, { origin: base });
  await once(client, 'open');
  const exchange = async (message: string) => {
    const response = once(client, 'message');
    client.send(message);
    const [raw] = await response;
    return JSON.parse(String(raw));
  };
  assert.equal((await exchange('{bad json')).code, 'INVALID_MESSAGE');
  assert.equal((await exchange(JSON.stringify({ type: 'fire', teamId: 2 }))).code, 'INVALID_MESSAGE');
  const hello = await exchange(
    JSON.stringify({
      type: 'client.hello',
      gameId: 'hedge-wars',
      protocolVersion: PROTOCOL_VERSION,
      rulesVersion: RULES_VERSION,
      contentHash: CONTENT_HASH,
    }),
  );
  assert.equal(hello.type, 'server.hello');
  assert.deepEqual(hello.capabilities, [...SERVER_CAPABILITIES]);
  assert.ok(hello.sessionId.startsWith('sess_'));
  assert.equal(typeof hello.resumeToken, 'string');

  const closed = once(client, 'close');
  const mismatch = await exchange(
    JSON.stringify({
      type: 'client.hello',
      gameId: 'hedge-wars',
      protocolVersion: PROTOCOL_VERSION + 1,
    }),
  );
  assert.equal(mismatch.code, 'PROTOCOL_MISMATCH');
  assert.equal(mismatch.requiresReload, true);
  assert.equal((await closed)[0], 1008);

  const foreign = new WebSocket(wsURL, { origin: 'https://unrelated.invalid' });
  const rejected = await new Promise<Error>((resolve) => foreign.once('error', resolve));
  assert.match(rejected.message, /403/);

  const oversized = new WebSocket(wsURL);
  await once(oversized, 'open');
  const tooLarge = once(oversized, 'close');
  oversized.send('x'.repeat(MAX_MESSAGE_BYTES + 1));
  assert.equal((await tooLarge)[0], 1009);
});
