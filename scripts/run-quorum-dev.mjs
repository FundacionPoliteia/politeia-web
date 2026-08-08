import { spawn } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const apiPort = process.env.QUORUM_API_PORT || '8090';
const webPort = process.env.QUORUM_WEB_PORT || '3100';
const env = {
  ...process.env,
  DATA_STORE: 'firestore',
  PORT: apiPort,
  PUBLIC_API_URL: `http://localhost:${apiPort}`,
  ALLOWED_ORIGINS: `http://localhost:${webPort},http://gestion.localhost:${webPort}`,
  QUORUM_API_BASE_URL: `http://localhost:${apiPort}`,
  NEXT_PUBLIC_QUORUM_API_BASE_URL: `http://localhost:${apiPort}`,
  NEXT_PUBLIC_SITE_URL: `http://localhost:${webPort}`,
};

const children = [
  spawn(process.execPath, ['--watch', '--import', 'tsx', 'services/quorum-api/src/index.ts'], { cwd: root, env, stdio: 'inherit' }),
  spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', 'apps/quorum', '-p', webPort], { cwd: root, env, stdio: 'inherit' }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(exitCode), 250).unref();
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
for (const child of children) {
  child.on('error', (error) => { console.error(error); stop(1); });
  child.on('exit', (code) => { if (!stopping && code !== 0) stop(code || 1); });
}

await Promise.all([waitFor(`http://localhost:${apiPort}/readyz`), waitFor(`http://localhost:${webPort}/gestion`)]);
console.info(`Quórum persistente listo: http://localhost:${webPort} · gestor http://gestion.localhost:${webPort} · API http://localhost:${apiPort}`);

async function waitFor(url) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* El servicio todavía está iniciando. */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`No se pudo iniciar ${url}`);
}
