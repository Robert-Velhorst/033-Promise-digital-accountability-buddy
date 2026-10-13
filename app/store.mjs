import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export class AppError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const hash = x => createHash('sha256').update(x).digest('hex');
export const defaults = { overdueAlerts: true, dueSoonAlerts: true, dueSoonHours: 24, nudgeAlerts: true, timezone: 'Europe/Amsterdam' };
const finalStates = ['fulfilled', 'broken', 'cancelled'];
const states = ['draft', 'active', 'overdue', ...finalStates];
const types = ['created', 'imported', 'confirmed', 'fulfilled', 'broken', 'cancelled', 'extended', 'overdue', 'reminded', 'commented', 'disputed', 'reopened', 'amended'];
const str = (x, max = 5000) => typeof x === 'string' ? x.trim().slice(0, max) : '';
function passwordHash(password, salt = randomBytes(16).toString('hex')) { return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
function passwordValid(password, encoded) { const [salt, original] = encoded.split(':'); return timingSafeEqual(Buffer.from(original, 'hex'), scryptSync(password, salt, 64)); }
function validPassword(password) { if (typeof password !== 'string' || password.length < 10 || password.length > 200) throw new AppError('Use a password of 10–200 characters.'); }
export function reliability(promises) {
  const resolved = promises.filter(p => ['fulfilled', 'broken'].includes(p.status) && !p.disputed);
  const weight = resolved.reduce((sum, p) => sum + p.spectrumLevel, 0);
  const kept = resolved.filter(p => p.status === 'fulfilled').reduce((sum, p) => sum + p.spectrumLevel, 0);
  return { score: weight ? Math.round(100 * kept / weight) : null, resolved: resolved.length, fulfilled: resolved.filter(p => p.status === 'fulfilled').length, broken: resolved.filter(p => p.status === 'broken').length, weight };
}
export function validatePromise(input, { imported = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('Invalid promise.');
  const summary = str(input.summary, 1000); if (!summary) throw new AppError('Describe the action you are agreeing to.');
  const originalText = str(input.originalText) || summary; const direction = input.direction ?? 'given';
  if (!['given', 'received', 'self'].includes(direction)) throw new AppError('Choose made, received or self.');
  const person = direction === 'self' ? '' : str(input.person, 100); if (direction !== 'self' && !person) throw new AppError('Enter the other person’s name.');
  const spectrumLevel = input.spectrumLevel ?? 2; if (!Number.isInteger(spectrumLevel) || spectrumLevel < 1 || spectrumLevel > 5) throw new AppError('Choose a spectrum level from 1 to 5.');
  const deadlineAt = input.deadlineAt == null || input.deadlineAt === '' ? null : Number(input.deadlineAt);
  if (deadlineAt != null && (!Number.isSafeInteger(deadlineAt) || deadlineAt <= 0 || deadlineAt > 253402300799999)) throw new AppError('Enter a valid deadline.');
  const status = imported ? input.status : input.confirmed === true ? 'active' : 'draft'; if (!states.includes(status)) throw new AppError('Invalid promise status.');
  if (input.tags != null && (!Array.isArray(input.tags) || input.tags.some(t => typeof t !== 'string'))) throw new AppError('Tags must be a list of words.');
  return { summary, originalText, direction, person, spectrumLevel, deadlineAt, status, tags: (input.tags || []).slice(0, 12).map(t => str(t, 40)).filter(Boolean), source: str(input.source, 100) || 'manual', agreementNote: str(input.agreementNote, 2000), disputed: imported && input.disputed === true, createdAt: imported && Number.isSafeInteger(input.createdAt) ? input.createdAt : Date.now(), fulfilledAt: imported && Number.isSafeInteger(input.fulfilledAt) ? input.fulfilledAt : null };
}
export class Store {
  constructor(file) {
    this.file = file;
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true }); this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS prefs(userId TEXT PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT NOT NULL REFERENCES users(id), promiseId TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL, previousHash TEXT NOT NULL, hash TEXT NOT NULL UNIQUE);
      CREATE INDEX IF NOT EXISTS events_owner ON events(userId, id);
      CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'Ledger events are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'Ledger events are append-only'); END;
      CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), promiseId TEXT, kind TEXT NOT NULL, message TEXT NOT NULL, at INTEGER NOT NULL, readAt INTEGER, key TEXT UNIQUE);`);
  }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
  register(input) {
    const email = str(input.email, 250).toLowerCase(); const name = str(input.name, 100);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) throw new AppError('Enter your name and a valid email address.'); validPassword(input.password);
    const id = randomUUID();
    try { this.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id, email, name, passwordHash(input.password), Date.now()); }
    catch (e) { if (e.code?.includes('CONSTRAINT') || e.message.includes('UNIQUE')) throw new AppError('This email already has an account. Sign in instead.', 409); throw e; }
    return this.session(id);
  }
  login(input) {
    validPassword(input.password); const user = this.db.prepare('SELECT * FROM users WHERE email=?').get(str(input.email, 250).toLowerCase());
    if (!user) { passwordHash(input.password, 'a'.repeat(32)); throw new AppError('Email or password is incorrect.', 401); }
    if (!passwordValid(input.password, user.password)) throw new AppError('Email or password is incorrect.', 401); return this.session(user.id);
  }
  session(userId) { const token = randomBytes(32).toString('hex'); const csrf = randomBytes(32).toString('hex'); this.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()); this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token), userId, csrf, Date.now() + 7 * 86400000); return { token, user: this.user(userId), csrf }; }
  authenticate(token) { if (!token) return null; return this.db.prepare('SELECT userId,csrf FROM sessions WHERE token=? AND expires>?').get(hash(token), Date.now()) || null; }
  logout(token) { this.db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token)); }
  user(id) { return this.db.prepare('SELECT id,email,name,created FROM users WHERE id=?').get(id); }
  changePassword(id, current, next) { validPassword(next); const user = this.db.prepare('SELECT password FROM users WHERE id=?').get(id); if (typeof current !== 'string' || current.length > 200 || !passwordValid(current, user.password)) throw new AppError('Current password is incorrect.', 401); this.transaction(() => { this.db.prepare('UPDATE users SET password=? WHERE id=?').run(passwordHash(next), id); this.db.prepare('DELETE FROM sessions WHERE userId=?').run(id); }); }
  preferences(id) { const row = this.db.prepare('SELECT data FROM prefs WHERE userId=?').get(id); return { ...defaults, ...(row ? JSON.parse(row.data) : {}) }; }
  validatePreferences(input) {
    const data = { ...defaults }; if (!input || typeof input !== 'object') throw new AppError('Invalid preferences.');
    for (const key of ['overdueAlerts', 'dueSoonAlerts', 'nudgeAlerts']) { if (typeof input[key] !== 'boolean') throw new AppError('Invalid reminder preference.'); data[key] = input[key]; }
    if (!Number.isInteger(input.dueSoonHours) || input.dueSoonHours < 1 || input.dueSoonHours > 168) throw new AppError('Reminder window must be 1–168 hours.');
    if (typeof input.timezone !== 'string') throw new AppError('Choose a valid time zone.'); try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }).format(); } catch { throw new AppError('Choose a valid time zone.'); }
    data.dueSoonHours = input.dueSoonHours; data.timezone = input.timezone; return data;
  }
  savePreferences(id, input) { const data = this.validatePreferences(input); this.db.prepare('INSERT INTO prefs VALUES(?,?) ON CONFLICT(userId) DO UPDATE SET data=excluded.data').run(id, JSON.stringify(data)); return data; }
  events(id) { return this.db.prepare('SELECT * FROM events WHERE userId=? ORDER BY id').all(id).map(e => ({ ...e, data: JSON.parse(e.data) })); }
  append(id, promiseId, type, data, at = Date.now()) {
    if (!types.includes(type)) throw new AppError('Invalid ledger event.'); const previousHash = this.db.prepare('SELECT hash FROM events WHERE userId=? ORDER BY id DESC LIMIT 1').get(id)?.hash || '0'.repeat(64); const serialized = JSON.stringify(data);
    const digest = hash(JSON.stringify([id, promiseId, type, serialized, at, previousHash]));
    this.db.prepare('INSERT INTO events(userId,promiseId,type,data,at,previousHash,hash) VALUES(?,?,?,?,?,?,?)').run(id, promiseId, type, serialized, at, previousHash, digest); return digest;
  }
  verify(id) { const rows = this.db.prepare('SELECT * FROM events WHERE userId=? ORDER BY id').all(id); let previous = '0'.repeat(64); for (const e of rows) { if (e.previousHash !== previous || e.hash !== hash(JSON.stringify([e.userId, e.promiseId, e.type, e.data, e.at, e.previousHash]))) return { valid: false, count: rows.length, failedEvent: e.id }; previous = e.hash; } return { valid: true, count: rows.length, head: previous }; }
  promises(id) { const result = new Map(); for (const event of this.events(id)) { if (event.type === 'created' || event.type === 'imported') result.set(event.promiseId, { ...event.data.promise, id: event.promiseId, updatedAt: event.at }); else { const p = result.get(event.promiseId); if (!p) throw new Error('Invalid ledger projection'); Object.assign(p, event.data.patch || {}, { updatedAt: event.at }); } } return [...result.values()].sort((a, b) => b.createdAt - a.createdAt); }
  promise(id, promiseId) { const p = this.promises(id).find(x => x.id === promiseId); if (!p) throw new AppError('Promise not found.', 404); return p; }
  create(id, input) { const promise = validatePromise(input); const promiseId = randomUUID(); if (promise.status === 'active' && promise.spectrumLevel >= 4 && !promise.agreementNote) throw new AppError('For a major commitment, record what was agreed before confirming.'); this.transaction(() => this.append(id, promiseId, 'created', { promise })); return this.promise(id, promiseId); }
  act(id, promiseId, input) {
    return this.transaction(() => {
      const p = this.promise(id, promiseId); const action = input.action; let patch = {}; const note = str(input.note, 2000);
      if (action === 'amended') {
        if (!['draft', 'active', 'overdue'].includes(p.status)) throw new AppError('Only an open promise or draft can be clarified.');
        if (!note) throw new AppError('Explain what was clarified.');
        const corrected = validatePromise(input.changes);
        patch = { summary: corrected.summary, direction: corrected.direction, person: corrected.person, spectrumLevel: corrected.spectrumLevel, deadlineAt: corrected.deadlineAt, tags: corrected.tags, status: 'draft', agreementNote: note };
      }
      else if (action === 'commented') { if (!note) throw new AppError('Enter a note.'); }
      else if (action === 'confirmed') { if (p.status !== 'draft') throw new AppError('Only a draft can be confirmed.'); if (p.spectrumLevel >= 4 && !note && !p.agreementNote) throw new AppError('Record what was agreed before confirming.'); patch = { status: 'active', agreementNote: note || p.agreementNote }; }
      else if (action === 'extended') { if (!['active', 'overdue'].includes(p.status)) throw new AppError('Only an open promise can be renegotiated.'); const deadlineAt = Number(input.deadlineAt); if (!Number.isSafeInteger(deadlineAt) || deadlineAt <= Date.now() || deadlineAt > 253402300799999 || !note) throw new AppError('Choose a future deadline and explain the new agreement.'); patch = { status: 'active', deadlineAt, agreementNote: note }; }
      else if (action === 'disputed') { if (!note) throw new AppError('Explain the disagreement.'); patch = { disputed: true }; }
      else if (action === 'reopened') { if (!finalStates.includes(p.status) && !p.disputed) throw new AppError('This promise is already open.'); if (!note) throw new AppError('Explain why the promise is being reopened.'); patch = { status: 'active', disputed: false, fulfilledAt: null }; }
      else if (finalStates.includes(action)) { if (!['active', 'overdue', 'draft'].includes(p.status) || (p.status === 'draft' && action !== 'cancelled')) throw new AppError('Confirm this promise before recording an outcome.'); if (p.disputed && action !== 'cancelled') throw new AppError('Resolve the disagreement before recording an outcome.'); patch = { status: action, fulfilledAt: action === 'fulfilled' ? Date.now() : null }; }
      else throw new AppError('Unknown action.');
      this.append(id, promiseId, action, { patch, note, previousStatus: p.status, previousDeadline: p.deadlineAt }); return this.promise(id, promiseId);
    });
  }
  notify(id, promiseId, kind, message, key, at = Date.now()) { const result = this.db.prepare('INSERT OR IGNORE INTO notifications VALUES(?,?,?,?,?,?,NULL,?)').run(randomUUID(), id, promiseId, kind, message, at, key); return result.changes > 0; }
  tick(now = Date.now()) {
    let added = 0; for (const { id } of this.db.prepare('SELECT id FROM users').all()) { const prefs = this.preferences(id); for (const p of this.promises(id)) { if (!['active', 'overdue'].includes(p.status) || !p.deadlineAt) continue; this.transaction(() => {
      if (p.deadlineAt < now) { if (p.status === 'active') this.append(id, p.id, 'overdue', { patch: { status: 'overdue' }, deadlineAt: p.deadlineAt }, now); if (prefs.overdueAlerts && this.notify(id, p.id, 'overdue', `Past the agreed deadline: ${p.summary}`, `${id}:${p.id}:overdue:${p.deadlineAt}`, now)) { this.append(id, p.id, 'reminded', { kind: 'overdue' }, now); added++; } }
      else if (prefs.dueSoonAlerts && p.deadlineAt <= now + prefs.dueSoonHours * 3600000 && this.notify(id, p.id, 'due_soon', `Due soon: ${p.summary}`, `${id}:${p.id}:due:${p.deadlineAt}`, now)) { this.append(id, p.id, 'reminded', { kind: 'due_soon' }, now); added++; }
    }); } } return added;
  }
  notifications(id) { return this.db.prepare('SELECT * FROM notifications WHERE userId=? ORDER BY at DESC LIMIT 300').all(id); }
  readNotifications(id, notificationId) { if (notificationId) this.db.prepare('UPDATE notifications SET readAt=? WHERE userId=? AND id=?').run(Date.now(), id, notificationId); else this.db.prepare('UPDATE notifications SET readAt=? WHERE userId=? AND readAt IS NULL').run(Date.now(), id); }
  snapshot(id) { return { promises: this.promises(id), events: this.events(id), notifications: this.notifications(id), prefs: this.preferences(id), integrity: this.verify(id) }; }
  export(id) { return { format: 'promise-backup', version: 1, exportedAt: new Date().toISOString(), ...this.snapshot(id) }; }
  import(id, data) {
    if (!data || data.format !== 'promise-backup' || data.version !== 1 || !Array.isArray(data.promises) || data.promises.length > 5000 || !Array.isArray(data.events) || data.events.length > 50000) throw new AppError('Choose a valid Promise JSON backup (up to 5,000 promises).');
    const validated = data.promises.map(p => validatePromise(p, { imported: true })); const ids = new Set(data.promises.map(p => p.id)); if (ids.size !== validated.length || data.promises.some(p => typeof p.id !== 'string')) throw new AppError('Duplicate or invalid promise IDs in backup.');
    let previous = '0'.repeat(64); const projection = new Map();
    for (const e of data.events) {
      if (!e || e.previousHash !== previous || typeof e.hash !== 'string' || !ids.has(e.promiseId) || e.hash !== hash(JSON.stringify([e.userId, e.promiseId, e.type, JSON.stringify(e.data), e.at, e.previousHash]))) throw new AppError('The backup’s ledger integrity check failed.'); previous = e.hash;
      if (['created', 'imported'].includes(e.type)) projection.set(e.promiseId, { ...e.data.promise }); else { const p = projection.get(e.promiseId); if (!p) throw new AppError('Invalid backup history.'); Object.assign(p, e.data.patch || {}); }
    }
    if (data.integrity?.head !== previous || data.integrity?.count !== data.events.length || data.integrity?.valid !== true) throw new AppError('The backup’s integrity checkpoint is missing or invalid.');
    for (let i = 0; i < validated.length; i++) { const original = projection.get(data.promises[i].id); if (!original || JSON.stringify(validatePromise(original, { imported: true })) !== JSON.stringify(validated[i])) throw new AppError('A backup promise does not match its history.'); }
    const prefs = this.validatePreferences(data.prefs);
    return this.transaction(() => { if (this.events(id).length) throw new AppError('Restore is available only in an empty account, to prevent duplicated histories.', 409); for (let i = 0; i < validated.length; i++) { const oldId = data.promises[i].id; this.append(id, randomUUID(), 'imported', { promise: validated[i], sourceId: oldId, sourceHistory: data.events.filter(e => e.promiseId === oldId), sourceHead: previous }); } this.savePreferences(id, prefs); return { count: validated.length }; });
  }
  close() { this.db.close(); }
}
