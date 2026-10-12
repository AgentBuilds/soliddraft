import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const file of ['src/main.js', 'server/app.js', 'server/index.js']) {
  const check = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
  if (check.error) throw check.error;
  if (check.status !== 0) process.exit(check.status || 1);
}
await mkdir(path.join(root, 'dist/src'), { recursive: true });
for (const [source, target] of [
  ['index.html', 'index.html'],
  ['src/main.js', 'src/main.js'],
  ['src/styles.css', 'src/styles.css'],
  ['public/favicon.svg', 'favicon.svg'],
]) {
  await copyFile(path.join(root, source), path.join(root, 'dist', target));
}
console.log('SolidDraft built successfully: dist/ (HTML, JavaScript, CSS and favicon).');
