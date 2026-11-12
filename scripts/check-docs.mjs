import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const required = ['AGENTS.md', 'README.md', 'docs/STATUS.md', 'docs/PLATFORM_SPEC.md', 'docs/UI_GUIDELINES.md', 'docs/OPERATIONS.md', '01_hedge_wars/AGENTS.md', ...['TECH_SPEC', 'CHECKLIST', 'ACCEPTANCE', 'HANDOFF', 'REUSE_PLAN', 'ASSET_REGISTER'].map((name) => `01_hedge_wars/docs/${name}.md`)];
for (const name of required) await stat(resolve(root, name));
async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['node_modules', 'dist', 'test-results', 'playwright-report'].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(path));
    else if (entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}
let links = 0;
for (const path of await markdownFiles(root)) {
  const source = await readFile(path, 'utf8');
  for (const match of source.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:|^\//i.test(target)) continue;
    await stat(resolve(dirname(path), decodeURIComponent(target)));
    links++;
  }
}
const checklist = await readFile(resolve(root, '01_hedge_wars/docs/CHECKLIST.md'), 'utf8');
const ids = [...checklist.matchAll(/^- \[[ x~!]\] ([A-Z]+-\d+)/gm)].map((match) => match[1]);
if (ids.length < 30 || new Set(ids).size !== ids.length) throw new Error('Checklist needs unique stable task IDs');
console.info(`Documentation OK: ${required.length} required files, ${links} relative links, ${ids.length} unique tasks.`);
