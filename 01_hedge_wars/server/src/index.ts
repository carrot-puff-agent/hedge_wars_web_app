import { fileURLToPath } from 'node:url';
import { createApp, SERVER_VERSION } from './app';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
const app = createApp({ root, allowedOrigins });
app.server.listen(port, host, () => console.info(JSON.stringify({ at: new Date().toISOString(), event: 'server.started', version: SERVER_VERSION, host, port })));
app.server.on('error', (error) => { console.error(JSON.stringify({ at: new Date().toISOString(), event: 'server.error', code: (error as NodeJS.ErrnoException).code })); process.exitCode = 1; });
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void app.close().catch(() => { process.exitCode = 1; });
  });
}
