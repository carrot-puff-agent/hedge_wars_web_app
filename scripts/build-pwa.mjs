import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const builds = [
  { directory: resolve(root, 'hub/dist'), prefix: '/' },
  { directory: resolve(root, '01_hedge_wars/client/dist'), prefix: '/games/hedge-wars/' },
];
async function files(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) result.push(...await files(path));
    else if (item.isFile()) result.push(path);
  }
  return result;
}
const entries = [];
for (const build of builds) {
  for (const path of await files(build.directory)) {
    const file = relative(build.directory, path).split('\\').join('/');
    // Public assets are supplied by the hub, not duplicated in the game scope.
    if (build.prefix !== '/' && !file.startsWith('assets/') && file !== 'index.html') continue;
    if (file === 'sw.js') continue;
    const url = file === 'index.html' ? build.prefix : build.prefix + file;
    entries.push({ url, bytes: await readFile(path) });
  }
}
entries.sort((a, b) => a.url.localeCompare(b.url));
const hash = createHash('sha256');
for (const { url, bytes } of entries) hash.update(url).update(bytes);
const version = hash.digest('hex').slice(0, 16);
const template = await readFile(resolve(root, 'platform/sw.template.js'), 'utf8');
const worker = template.replace('__CACHE_NAME__', `yizhaklub-shell-${version}`).replace('__ASSETS__', JSON.stringify(entries.map(({ url }) => url)));
await writeFile(resolve(root, 'hub/dist/sw.js'), worker);
console.log(`PWA cache yizhaklub-shell-${version}: ${entries.length} files`);
