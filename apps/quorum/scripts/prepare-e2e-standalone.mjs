import { cp, mkdir, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const appRoot = process.cwd();
const buildRoot = resolve(appRoot, '.next');
const standaloneRoot = resolve(buildRoot, 'standalone', 'apps', 'quorum');
const staticSource = resolve(buildRoot, 'static');
const publicSource = resolve(appRoot, 'public');
const staticTarget = resolve(standaloneRoot, '.next', 'static');
const publicTarget = resolve(standaloneRoot, 'public');

function isWithin(root, path) {
  const pathFromRoot = relative(root, path);
  return pathFromRoot !== '' && pathFromRoot !== '..' && !pathFromRoot.startsWith('..' + sep);
}

for (const [label, path] of [
  ['static build', staticSource],
  ['public assets', publicSource],
  ['standalone output', standaloneRoot],
]) {
  if (!(await stat(path)).isDirectory()) throw new Error('Missing ' + label + ': ' + path);
}

if (!isWithin(buildRoot, staticTarget) || !isWithin(buildRoot, publicTarget)) {
  throw new Error('E2E asset destinations must stay inside the generated .next build directory.');
}

await mkdir(resolve(standaloneRoot, '.next'), { recursive: true });
await cp(staticSource, staticTarget, { recursive: true, force: true });
await cp(publicSource, publicTarget, { recursive: true, force: true });
