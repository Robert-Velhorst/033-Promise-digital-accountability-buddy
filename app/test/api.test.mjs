import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
test('API enforces sessions, CSRF, origin, ownership, and static file boundaries', async () => {
  const { server } = createApp({ database: ':memory:', port: 0 }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const unauth = await fetch(origin + '/api/state'); assert.equal(unauth.status, 401);
    const foreign = await fetch(origin + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' }, body: '{}' }); assert.equal(foreign.status, 403);
    const registration = await fetch(origin + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ name: 'API Test', email: 'api@example.org', password: 'a strong password 123' }) }); assert.equal(registration.status, 200); const { csrf } = await registration.json(); const cookie = registration.headers.get('set-cookie').split(';')[0]; assert.match(registration.headers.get('set-cookie'), /HttpOnly/);
    const headers = { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie };
    assert.equal((await fetch(origin + '/api/promises', { method: 'POST', headers, body: '{}' })).status, 403);
    headers['X-CSRF-Token'] = csrf;
    const create = await fetch(origin + '/api/promises', { method: 'POST', headers, body: JSON.stringify({ summary: 'A real action', direction: 'self', spectrumLevel: 2 }) }); assert.equal(create.status, 201);
    const created = await create.json(); assert.equal(created.status, 'draft');
    const invalid = await fetch(origin + '/api/action', { method: 'POST', headers, body: JSON.stringify({ id: 'not-your-promise', action: 'fulfilled' }) }); assert.equal(invalid.status, 404);
    const snapshot = await (await fetch(origin + '/api/state', { headers: { Cookie: cookie } })).json(); assert.equal(snapshot.promises.length, 1); assert.equal(snapshot.integrity.valid, true);
    assert.equal((await fetch(origin + '/store.mjs')).status, 404); assert.equal((await fetch(origin + '/data/promise.sqlite')).status, 404);
    const html = await fetch(origin); assert.equal(html.status, 200); assert.match(html.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
