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
  for (const script of ['scripts/smoke.js', 'scripts/qa.js']) await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, url], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit', timeout: 30000,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`HTTP acceptance failed (${signal || code}) in ${script}`)));
  });
} finally {
  await new Promise(resolve => app.close(resolve));
}
