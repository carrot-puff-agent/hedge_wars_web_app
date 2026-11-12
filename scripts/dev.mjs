import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const workspaces = ['@yizhaklub/hedge-server', '@yizhaklub/hedge-client', '@yizhaklub/hub'];
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already stopped. */ }
  }
}
console.info('Hub http://127.0.0.1:5173 · Game http://127.0.0.1:5174/games/hedge-wars/ · Backend :8787');
for (const workspace of workspaces) {
  const child = spawn('npm', ['run', 'dev', '--workspace', workspace], { cwd: root, stdio: 'inherit', detached: true });
  children.push(child);
  child.on('error', (error) => { console.error(error.message); stop(1); });
  child.on('exit', (code) => { if (!stopping) stop(code ?? 1); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
