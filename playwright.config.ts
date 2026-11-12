import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const development = process.env.E2E_MODE === 'development';
const origin = development ? 'http://127.0.0.1:5173' : 'http://127.0.0.1:8790';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: origin, trace: 'retain-on-failure', launchOptions: { executablePath, args: ['--no-sandbox'] } },
  webServer: {
    command: development ? 'npm run dev' : 'npm run build && npm start',
    url: `${origin}/api/health`,
    env: { HOST: '127.0.0.1', PORT: development ? '8787' : '8790' },
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    timeout: 120000,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'android-emulation', use: { ...devices['Pixel 7'], browserName: 'chromium', viewport: { width: 360, height: 800 } } },
  ],
});
