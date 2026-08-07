import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const forbiddenNames = files.filter((file) => {
  const name = file.replace(/\\/g, '/').split('/').at(-1) || '';
  if (/^\.env(?:\..+)?$/.test(name) && name !== '.env.example') return true;
  if (/\.tfstate(?:\..+)?$/.test(name)) return true;
  if (/\.tfvars$/.test(name)) return true;
  if (/\.(?:pem|p12|pfx|key)$/i.test(name)) return true;
  return /(?:service-account|application_default_credentials|credentials).*\.json$/i.test(name);
});

const suspiciousContent = [];
const patterns = [
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /"private_key_id"\s*:/,
  /"private_key"\s*:\s*"-----BEGIN/,
  /\bgh[opsu]_[A-Za-z0-9]{30,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bre_[A-Za-z0-9_-]{24,}\b/,
];

for (const file of files) {
  if (/\.(?:png|jpe?g|gif|webp|woff2?|ico|pdf|docx|lock)$/i.test(file)) continue;
  let value = '';
  try { value = readFileSync(file, 'utf8'); } catch { continue; }
  if (patterns.some((pattern) => pattern.test(value))) suspiciousContent.push(file);
}

if (forbiddenNames.length || suspiciousContent.length) {
  console.error('Se detectaron archivos o patrones que no deben publicarse:');
  for (const file of [...new Set([...forbiddenNames, ...suspiciousContent])]) console.error(`- ${file}`);
  process.exit(1);
}

console.log(`Control de secretos correcto: ${files.length} archivos versionados revisados.`);
