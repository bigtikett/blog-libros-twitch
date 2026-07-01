import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(backendDir, 'package.json');

const bumpType = (process.argv[2] || 'patch').trim().toLowerCase();
const allowed = new Set(['patch', 'minor', 'major']);

if (!allowed.has(bumpType)) {
  console.error(`[release] Tipo de version invalido: ${bumpType}`);
  console.error('[release] Usa: patch | minor | major');
  process.exit(1);
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, cwd = backendDir) {
  execSync(command, {
    cwd,
    stdio: 'inherit'
  });
}

try {
  run(`${npmCmd} version ${bumpType} --no-git-tag-version`);

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const nextVersion = String(pkg.version || '').trim();
  if (!nextVersion) {
    throw new Error('No se pudo leer la nueva version desde package.json');
  }

  run('git add -A :/', backendDir);
  run(`git commit -m "chore(release): bump backend to v${nextVersion}"`, backendDir);
  run('git push', backendDir);

  console.log(`[release] Publicado backend v${nextVersion}`);
} catch (error) {
  console.error('[release] Fallo el proceso de release:', error.message || error);
  process.exit(1);
}
