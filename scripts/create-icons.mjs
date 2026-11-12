// Rasterize the licensed vector app icon. This authoring step requires Chromium;
// the committed PNGs are used directly by ordinary builds.
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const svg = await readFile(`${root}/hub/public/icons/controller.svg`, 'utf8');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
try {
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await page.locator('svg').screenshot({ path: `${root}/hub/public/icons/controller-${size}.png` });
    await page.close();
  }
} finally { await browser.close(); }
