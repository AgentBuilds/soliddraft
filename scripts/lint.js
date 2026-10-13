import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
let count = 0;
for (const directory of ['server', 'src', 'scripts', 'test']) {
  for (const file of (await readdir(path.join(root, directory))).filter(file => file.endsWith('.js'))) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, directory, file)], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
    count++;
  }
}
console.log(`Syntax lint passed: ${count} JavaScript files checked.`);
