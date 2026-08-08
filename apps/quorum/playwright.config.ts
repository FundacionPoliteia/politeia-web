import { defineConfig, devices } from '@playwright/test';

const webPort = Number(process.env.QUORUM_E2E_WEB_PORT || 3310);
const apiPort = Number(process.env.QUORUM_E2E_API_PORT || 8890);
const externalServers = process.env.QUORUM_E2E_EXTERNAL_SERVERS === 'true';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  // Both browser projects share one in-memory API. Serial execution keeps writes deterministic.
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${webPort}`, trace: 'retain-on-failure' },
  webServer: externalServers ? undefined : [
    { command: 'node --import tsx ../../services/quorum-api/src/index.ts', url: `http://localhost:${apiPort}/healthz`, reuseExistingServer: false, env: { ...process.env, DEV_AUTH: 'true', DATA_STORE: 'memory', PORT: String(apiPort), NODE_ENV: 'development', PUBLIC_API_URL: `http://localhost:${apiPort}`, ALLOWED_ORIGINS: `http://localhost:${webPort}` } },
    { command: 'node .next/standalone/apps/quorum/server.js', url: `http://localhost:${webPort}/gestion`, reuseExistingServer: false, timeout: 60_000, env: { ...process.env, PORT: String(webPort), HOSTNAME: '0.0.0.0', QUORUM_API_BASE_URL: `http://localhost:${apiPort}`, NEXT_PUBLIC_QUORUM_API_BASE_URL: `http://localhost:${apiPort}` } },
  ],
  projects: [{ name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'chromium-mobile', use: { ...devices['Pixel 5'] } }],
});
