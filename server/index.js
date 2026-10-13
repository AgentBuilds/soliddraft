import { createApp } from './app.js';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
const dev = process.argv.includes('--dev');
const options = dev ? { dev: true, distDir: fileURLToPath(new URL('../', import.meta.url)) } : {};
const server = createApp(options).listen(port, host, () => {
  console.log(`SolidDraft is running at http://${host}:${port}`);
});
server.on('error', (error) => {
  console.error(`SolidDraft failed to start: ${error.message}`);
  server.close();
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close());
}
