import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const targetFile = path.join(rootDir, 'node_modules', '.better-sqlite3-target');

const target = process.argv[2];
if (target !== 'node' && target !== 'electron') {
  console.error('Usage: node ensure-db-addon.js [node|electron]');
  process.exit(1);
}

let currentTarget = '';
try {
  currentTarget = fs.readFileSync(targetFile, 'utf8').trim();
} catch {}

if (currentTarget === target) {
  process.exit(0);
}

console.log(`[Addon] better-sqlite3 is currently compiled for "${currentTarget || 'unknown'}", rebuilding for "${target}"...`);

try {
  if (target === 'node') {
    execSync('pnpm db:rebuild:node', { cwd: rootDir, stdio: 'inherit' });
  } else {
    execSync('pnpm db:rebuild:electron', { cwd: rootDir, stdio: 'inherit' });
  }
  
  // Ensure target folder exists and write target flag
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, target, 'utf8');
  console.log(`[Addon] successfully rebuilt for "${target}"`);
} catch (error) {
  console.error(`[Addon] failed to rebuild for "${target}":`, error.message);
  process.exit(1);
}
