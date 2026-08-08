import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmCli = process.env.npm_execpath;
const webPort = process.env.QUORUM_E2E_WEB_PORT || '3310';
const apiPort = process.env.QUORUM_E2E_API_PORT || '8890';
const env = {
  ...process.env,
  QUORUM_E2E_WEB_PORT: webPort,
  QUORUM_E2E_API_PORT: apiPort,
  NEXT_PUBLIC_SITE_URL: `http://localhost:${webPort}`,
  QUORUM_API_BASE_URL: `http://localhost:${apiPort}`,
  NEXT_PUBLIC_QUORUM_API_BASE_URL: `http://localhost:${apiPort}`,
};

run(['run', 'build', '--workspace', '@politeia/quorum-contracts']);
run(['run', 'build', '--workspace', '@politeia/quorum-web']);
prepareStandaloneAssets();
const api = spawn(process.execPath, ['--import', 'tsx', 'services/quorum-api/src/index.ts'], {
  cwd: process.cwd(), env: { ...env, DEV_AUTH: 'true', DATA_STORE: 'memory', PORT: apiPort, NODE_ENV: 'development', PUBLIC_API_URL: `http://localhost:${apiPort}`, ALLOWED_ORIGINS: `http://localhost:${webPort}` }, stdio: 'inherit',
});
const web = spawn(process.execPath, ['.next/standalone/apps/quorum/server.js'], {
  cwd: path.join(process.cwd(), 'apps', 'quorum'), env: { ...env, PORT: webPort, HOSTNAME: '0.0.0.0' }, stdio: 'inherit',
});
try {
  await waitFor(`http://localhost:${apiPort}/healthz`);
  await waitFor(`http://localhost:${webPort}/gestion`);
  run(['run', 'test:e2e', '--workspace', '@politeia/quorum-web'], { QUORUM_E2E_EXTERNAL_SERVERS: 'true' });
} finally {
  api.kill(); web.kill();
}

function run(args, extraEnv = {}) {
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, ...args], { cwd: process.cwd(), env: { ...env, ...extraEnv }, stdio: 'inherit' })
    : spawnSync(npm, args, { cwd: process.cwd(), env: { ...env, ...extraEnv }, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function waitFor(url) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function prepareStandaloneAssets() {
  const appRoot = path.join(process.cwd(), 'apps', 'quorum');
  const standaloneRoot = path.join(appRoot, '.next', 'standalone', 'apps', 'quorum');
  const staticTarget = path.join(standaloneRoot, '.next', 'static');
  mkdirSync(path.dirname(staticTarget), { recursive: true });
  cpSync(path.join(appRoot, '.next', 'static'), staticTarget, { recursive: true, force: true });
  const publicSource = path.join(appRoot, 'public');
  if (existsSync(publicSource)) cpSync(publicSource, path.join(standaloneRoot, 'public'), { recursive: true, force: true });
}
