import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';

// Repeatable production HTTP readiness check with an isolated database and port.
const app = createApp({ databasePath: ':memory:' });
try {
  await new Promise((resolve, reject) => {
    app.once('error', reject);
    app.listen(0, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${app.address().port}`;
  console.log(`Acceptance service ready at ${url} (isolated database).`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/smoke.js', url], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`HTTP acceptance failed (${code})`)));
  });
} finally {
  await new Promise(resolve => app.close(resolve));
}
