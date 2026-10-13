// Run against an already-running development or production service.
const base = process.argv[2] || 'http://127.0.0.1:3000';
for (const [route, type] of [
  ['/', 'text/html'], ['/src/main.js', 'text/javascript'], ['/src/styles.css', 'text/css'],
  ['/favicon.svg', 'image/svg+xml'], ['/api/health', 'application/json'],
  ['/api/templates', 'application/json'], ['/api/projects', 'application/json'],
]) {
  const response = await fetch(new URL(route, base), { signal: AbortSignal.timeout(5000) });
  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();
  if (response.status !== 200 || !contentType.startsWith(type) || !body.length) {
    throw new Error(`Smoke check failed for ${route}: ${response.status}, ${contentType}`);
  }
  if (route === '/api/health' && JSON.parse(body).status !== 'ok') throw new Error('Service is unhealthy');
  if (route === '/api/templates' && JSON.parse(body).templates.length !== 3) throw new Error('Expected three templates');
  if (route === '/api/projects' && !Array.isArray(JSON.parse(body).projects)) throw new Error('Invalid projects response');
  console.log(`${route}: HTTP 200, ${contentType}`);
}
console.log('Live HTTP smoke checks passed.');
