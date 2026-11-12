import { createServer, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import {
  CONTENT_HASH,
  ClientMessage,
  ERROR_MESSAGES_UK,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  RULES_VERSION,
  type ServerMessage,
} from '@yizhaklub/hedge-protocol';
import { games, publicGames } from '../../../platform/games';
import { RoomManager, type RoomManagerOptions } from './rooms';

export const SERVER_VERSION = '0.1.0';
const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.webp': 'image/webp',
};

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

export function createApp(options: {
  root: string;
  allowedOrigins?: string[];
  roomOptions?: Omit<RoomManagerOptions, 'serverVersion'>;
}) {
  const rooms = new RoomManager({
    serverVersion: SERVER_VERSION,
    ...options.roomOptions,
  });

  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        json(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }
      let pathname: string;
      try {
        pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://origin.local').pathname);
      } catch {
        json(response, 400, { error: 'BAD_PATH' });
        return;
      }
      if (pathname === '/api/health') {
        json(response, 200, {
          status: 'ok',
          version: SERVER_VERSION,
          protocolVersion: PROTOCOL_VERSION,
          rulesVersion: RULES_VERSION,
          contentHash: CONTENT_HASH,
          stage: 'foundation',
        });
        return;
      }
      if (pathname === '/api/games') {
        json(response, 200, publicGames());
        return;
      }
      const game = games.find((entry) => pathname.startsWith(entry.path));
      if (games.some((entry) => pathname === entry.path.slice(0, -1))) {
        response.writeHead(308, { Location: `${pathname}/` });
        response.end();
        return;
      }
      const directory = resolve(options.root, game?.clientDirectory ?? 'hub/dist');
      const relativePath = game ? pathname.slice(game.path.length) : pathname.slice(1);
      const file = resolve(directory, relativePath || 'index.html');
      if (!file.startsWith(`${directory}${sep}`)) {
        json(response, 403, { error: 'FORBIDDEN_PATH' });
        return;
      }
      try {
        if (!(await stat(file)).isFile()) {
          json(response, 404, { error: 'NOT_FOUND' });
          return;
        }
        const body = await readFile(file);
        response.writeHead(200, {
          'Content-Type': mimeTypes[extname(file)] ?? 'application/octet-stream',
          'Content-Length': body.length,
          'Cache-Control': relativePath.startsWith('assets/')
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(request.method === 'HEAD' ? undefined : body);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        json(response, code === 'ENOENT' || code === 'ENOTDIR' ? 404 : 500, {
          error: code === 'ENOENT' || code === 'ENOTDIR' ? 'NOT_FOUND' : 'INTERNAL_ERROR',
        });
      }
    })().catch(() => {
      if (!response.headersSent) json(response, 500, { error: 'INTERNAL_ERROR' });
      else response.end();
    });
  });

  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
    perMessageDeflate: false,
  });
  server.on('upgrade', (request, socket, head) => {
    const origin = request.headers.origin;
    const host = request.headers.host;
    const sameHost = origin === `http://${host}` || origin === `https://${host}`;
    const allowed = !origin || sameHost || options.allowedOrigins?.includes(origin);
    if (request.url !== '/ws' || !allowed) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit('connection', client));
  });

  sockets.on('connection', (client) => {
    const timer = setTimeout(() => client.close(1008, 'HELLO_TIMEOUT'), 5000);
    timer.unref();
    client.on('close', () => {
      clearTimeout(timer);
      rooms.handleSocketClose(client);
    });
    client.on('error', () => {
      /* Transport errors are handled by close; never log raw message bodies. */
    });
    const send = (message: ServerMessage) => client.send(JSON.stringify(message));
    client.on('message', (raw, binary) => {
      let input: unknown;
      try {
        input = binary ? undefined : JSON.parse(raw.toString());
      } catch {
        send({
          type: 'server.error',
          code: 'INVALID_MESSAGE',
          messageUk: ERROR_MESSAGES_UK.INVALID_MESSAGE,
        });
        return;
      }
      const parsed = ClientMessage.safeParse(input);
      if (!parsed.success) {
        send({
          type: 'server.error',
          code: 'INVALID_MESSAGE',
          messageUk: ERROR_MESSAGES_UK.INVALID_MESSAGE,
        });
        return;
      }
      if (parsed.data.type === 'client.hello') {
        const ok = rooms.handleClientMessage(client, parsed.data);
        if (ok) clearTimeout(timer);
        return;
      }
      rooms.handleClientMessage(client, parsed.data);
    });
  });

  async function close() {
    rooms.closeAll();
    for (const client of sockets.clients) client.terminate();
    await new Promise<void>((done) => sockets.close(() => done()));
    server.closeIdleConnections();
    await new Promise<void>((done, reject) => server.close((error) => (error ? reject(error) : done())));
  }
  return { server, close, rooms };
}
