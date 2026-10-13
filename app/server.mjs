import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, AppError } from './store.mjs';
import { analyzeText } from './analyzer.mjs';
import { Conversations } from './conversations.mjs';
import { Gmail } from './gmail.mjs';
import { parseImport } from './messages.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
export function createApp({ database = join(root, 'data', 'promise.sqlite'), port = 4310 } = {}) {
  const store = new Store(database); const conversations = new Conversations(store); const gmail = new Gmail(conversations); const attempts = new Map();
  const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  const body = async req => { let data = ''; for await (const chunk of req) { data += chunk; if (Buffer.byteLength(data) > 8 * 1024 * 1024) throw new AppError('Request is too large (8 MB maximum).', 413); } try { return data ? JSON.parse(data) : {}; } catch { throw new AppError('Invalid JSON.'); } };
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self), on-device-speech-recognition=(self)');
    try {
      const host = req.headers.host || ''; const boundPort = server.address()?.port || port;
      if (![ `localhost:${boundPort}`, `127.0.0.1:${boundPort}` ].includes(host)) throw new AppError('Only local connections are accepted.', 403);
      const path = new URL(req.url, `http://${host}`).pathname;
      if (path === '/bridge/ingest' || path === '/bridge/state') {
        const owner = conversations.bridgeOwner(req.headers.authorization?.replace(/^Bearer /, ''));
        if (!owner) throw new AppError('Pair the extension in your signed-in Promise workspace.', 401);
        const origin = req.headers.origin;
        if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) throw new AppError('Extension origin rejected.', 403);
        if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
        if (req.method === 'GET' && path === '/bridge/state') return send(res, 200, { count: conversations.snapshot(owner).counts.open });
        if (req.method !== 'POST' || path !== '/bridge/ingest') throw new AppError('Method not allowed.', 405);
        const input = await body(req); if (!['gmail-visible', 'outlook-visible'].includes(input.channel)) throw new AppError('Only selected Gmail or Outlook browser content is accepted.');
        return send(res, 200, conversations.ingest(owner, parseImport({ ...input, format: 'json', timezone: conversations.config(owner).timezone }), { route: 'browser', label: input.label || input.conversation, complete: false }));
      }
      if (path === '/oauth/gmail/callback' && req.method === 'GET') {
        const token = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('promise_session='))?.slice(16); const auth = store.authenticate(token);
        if (!auth) throw new AppError('Sign into Promise on this host before connecting Gmail.', 401);
        await gmail.callback(auth.userId, new URL(req.url, `http://${host}`).searchParams);
        res.writeHead(303, { Location: '/#connections', 'Cache-Control': 'no-store' }); res.end(); return;
      }
      if (path.startsWith('/api/')) {
        if (req.method === 'GET' && path === '/api/version') return send(res, 200, { app: 'promise', version: '3.0.0' });
        if (req.method !== 'GET' && req.headers.origin !== `http://${host}`) throw new AppError('Request origin was rejected.', 403);
        const token = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('promise_session='))?.slice(16); const auth = store.authenticate(token);
        if (req.method === 'GET' && path === '/api/me') return send(res, 200, auth ? { user: store.user(auth.userId), csrf: auth.csrf } : { user: null });
        if (req.method === 'POST' && ['/api/register', '/api/login'].includes(path)) {
          const key = req.socket.remoteAddress; const now = Date.now(); const record = attempts.get(key); const entry = record && now - record.start < 600000 ? record : { count: 0, start: now };
          if (++entry.count > 20) throw new AppError('Too many sign-in attempts. Try again in 10 minutes.', 429); attempts.set(key, entry);
          const input = await body(req); const result = path === '/api/register' ? store.register(input) : store.login(input);
          res.setHeader('Set-Cookie', `promise_session=${result.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`); return send(res, 200, { user: result.user, csrf: result.csrf });
        }
        if (!auth) throw new AppError('Please sign in.', 401); if (req.method !== 'GET' && req.headers['x-csrf-token'] !== auth.csrf) throw new AppError('Your session needs to be refreshed.', 403);
        const id = auth.userId;
        if (req.method === 'GET' && path === '/api/state') { store.tick(); conversations.tick(); return send(res, 200, { ...store.snapshot(id), conversations: conversations.snapshot(id), gmail: gmail.info(id) }); }
        if (req.method === 'GET' && path === '/api/conversations/export') { res.setHeader('Content-Disposition', 'attachment; filename="Promise-Conversations.json"'); return send(res, 200, { format: 'promise-conversations', version: 1, ...conversations.snapshot(id) }); }
        if (req.method === 'GET' && path === '/api/export') { res.setHeader('Content-Disposition', 'attachment; filename="Promise-Backup.json"'); return send(res, 200, store.export(id)); }
        if (req.method !== 'POST') throw new AppError('Endpoint not found.', 404); const input = await body(req);
        if (path === '/api/logout') { store.logout(token); res.setHeader('Set-Cookie', 'promise_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'); return send(res, 200, { ok: true }); }
        if (path === '/api/promises') return send(res, 201, store.create(id, input));
        if (path === '/api/conversations/import') return send(res, 200, conversations.import(id, input));
        if (path === '/api/conversations/action') return send(res, 200, conversations.act(id, input));
        if (path === '/api/conversations/config') return send(res, 200, conversations.saveConfig(id, input));
        if (path === '/api/conversations/exclude') return send(res, 200, conversations.exclude(id, input.id));
        if (path === '/api/conversations/draft') return send(res, 200, conversations.draft(id, input.id));
        if (path === '/api/conversations/copied') return send(res, 200, conversations.copied(id, input.id));
        if (path === '/api/conversations/validate-draft') return send(res, 200, conversations.validateDraft(id, input.id));
        if (path === '/api/bridge/pair') return send(res, 200, conversations.pairing(id));
        if (path === '/api/bridge/revoke') return send(res, 200, conversations.revokePair(id));
        if (path === '/api/gmail/configure') return send(res, 200, gmail.configure(id, input));
        if (path === '/api/gmail/connect') return send(res, 200, gmail.connect(id, `http://${host}/oauth/gmail/callback`));
        if (path === '/api/gmail/sync') return send(res, 200, await gmail.sync(id));
        if (path === '/api/gmail/disconnect') return send(res, 200, await gmail.disconnect(id));
        if (path === '/api/action') return send(res, 200, store.act(id, input.id, input));
        if (path === '/api/analyze') { if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 20000) throw new AppError('Enter 1–20,000 characters.'); return send(res, 200, analyzeText(input.text)); }
        if (path === '/api/preferences') return send(res, 200, store.savePreferences(id, input));
        if (path === '/api/read') { store.readNotifications(id, input.id); return send(res, 200, { ok: true }); }
        if (path === '/api/test-notification') { store.notify(id, null, 'test', 'Promise reminders are working. Keep the local server running for deadline checks.', `test:${id}:${Date.now()}`); return send(res, 200, { ok: true }); }
        if (path === '/api/import') return send(res, 200, store.import(id, input));
        if (path === '/api/password') { store.changePassword(id, input.currentPassword, input.password); res.setHeader('Set-Cookie', 'promise_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'); return send(res, 200, { ok: true }); }
        throw new AppError('Endpoint not found.', 404);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new AppError('Method not allowed.', 405);
      if (!['/', '/index.html', '/app.js', '/api.js', '/views.js', '/capture.js', '/style.css', '/conversation-ui.js', '/conversation-actions.js', '/conversation.css', '/manifest.webmanifest', '/icon.svg'].includes(path)) throw new AppError('Page not found.', 404);
      const file = path === '/' ? 'index.html' : path.slice(1); const bytes = readFileSync(join(root, 'public', file)); res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (e) { if (!(e instanceof AppError)) console.error(e); send(res, e.status || 500, { error: e.status ? e.message : 'An unexpected error occurred. Your saved records have not been removed.' }); }
  });
  const timer = setInterval(() => { try { store.tick(); conversations.tick(); void gmail.background(); } catch (e) { console.error('Reminder check failed:', e); } }, 60000); timer.unref(); server.on('close', () => { clearInterval(timer); store.close(); }); return { server, store, conversations, gmail };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4310); const { server } = createApp({ port, database: process.env.PROMISE_DATABASE || join(root, 'data', 'promise.sqlite') });
  server.listen(port, '127.0.0.1', () => console.log(`Promise is ready at http://localhost:${port}\nData is saved locally. Keep this process running for reminders.`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
