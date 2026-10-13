import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, defaults, reliability } from '../store.mjs';
import { analyzeText } from '../analyzer.mjs';
const user = (store, email = 'test@example.org') => store.register({ name: 'Test', email, password: 'a strong password 123' }).user.id;
const promise = (extra = {}) => ({ summary: 'Send the report', originalText: 'I will send the report.', direction: 'given', person: 'Sarah', spectrumLevel: 3, confirmed: true, ...extra });
test('records persist across reopening and ledger changes are blocked', () => {
  const dir = mkdtempSync(join(tmpdir(), 'promise-test-')); const path = join(dir, 'db.sqlite'); let store = new Store(path);
  try { const id = user(store); const p = store.create(id, promise()); store.act(id, p.id, { action: 'fulfilled', note: 'Sent by email.' }); const checkpoint = store.verify(id); assert.equal(checkpoint.valid, true); assert.equal(checkpoint.count, 2);
    assert.throws(() => store.db.exec("UPDATE events SET type='broken'"), /append-only/); assert.throws(() => store.db.exec('DELETE FROM events'), /append-only/);
    store.close(); store = new Store(path); assert.equal(store.promise(id, p.id).status, 'fulfilled'); assert.equal(store.verify(id).head, checkpoint.head);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('one account cannot inspect or mutate another account’s promises', () => {
  const store = new Store(':memory:'); try { const alice = user(store); const bob = user(store, 'bob@example.org'); const p = store.create(alice, promise()); assert.equal(store.promises(bob).length, 0); assert.throws(() => store.promise(bob, p.id), /not found/); assert.throws(() => store.act(bob, p.id, { action: 'fulfilled' }), /not found/); assert.equal(store.promise(alice, p.id).status, 'active'); assert.equal(store.events(bob).length, 0); } finally { store.close(); }
});
test('drafts are reviewed before outcomes; major promises need an agreement note', () => {
  const store = new Store(':memory:'); try { const id = user(store); const p = store.create(id, promise({ confirmed: false, spectrumLevel: 5 })); assert.throws(() => store.act(id, p.id, { action: 'fulfilled' }), /Confirm/); assert.throws(() => store.act(id, p.id, { action: 'confirmed' }), /agreed/); store.act(id, p.id, { action: 'confirmed', note: 'We agreed in person.' }); assert.equal(store.promise(id, p.id).status, 'active'); assert.equal(store.verify(id).count, 2); } finally { store.close(); }
});
test('renegotiation preserves the original deadline and enforces a future date', () => {
  const store = new Store(':memory:'); try { const id = user(store); const original = Date.now() - 10000; const p = store.create(id, promise({ deadlineAt: original })); store.tick(); assert.equal(store.promise(id, p.id).status, 'overdue'); assert.throws(() => store.act(id, p.id, { action: 'extended', deadlineAt: original, note: 'Changed' }), /future/); const next = Date.now() + 86400000; store.act(id, p.id, { action: 'extended', deadlineAt: next, note: 'Sarah agreed to tomorrow.' }); const event = store.events(id).at(-1); assert.equal(event.data.previousDeadline, original); assert.equal(event.data.patch.deadlineAt, next); assert.equal(store.promise(id, p.id).status, 'active'); } finally { store.close(); }
});
test('reminders are deduplicated, per-user preferences persist and overdue is not broken', () => {
  const store = new Store(':memory:'); try { const id = user(store); const other = user(store, 'other@example.org'); store.savePreferences(other, { ...defaults, overdueAlerts: false }); const p = store.create(id, promise({ deadlineAt: Date.now() - 1000 })); store.create(other, promise({ deadlineAt: Date.now() - 1000 })); store.tick(); store.tick(); assert.equal(store.notifications(id).length, 1); assert.equal(store.notifications(other).length, 0); assert.equal(store.promise(id, p.id).status, 'overdue'); assert.equal(store.events(id).filter(e => e.type === 'overdue').length, 1); assert.equal(store.preferences(other).overdueAlerts, false); } finally { store.close(); }
});
test('scores exclude open, cancelled and disputed promises and weight significance', () => {
  assert.equal(reliability([]).score, null); const list = [{ status: 'fulfilled', spectrumLevel: 3 }, { status: 'broken', spectrumLevel: 1 }, { status: 'active', spectrumLevel: 5 }, { status: 'cancelled', spectrumLevel: 5 }, { status: 'broken', spectrumLevel: 5, disputed: true }]; assert.equal(reliability(list).score, 75); assert.equal(reliability(list).resolved, 2);
});
test('disagreement blocks outcomes and requires an explanation to resolve', () => {
  const store = new Store(':memory:'); try { const id = user(store); const p = store.create(id, promise()); store.act(id, p.id, { action: 'disputed', note: 'We disagree about the scope.' }); assert.throws(() => store.act(id, p.id, { action: 'fulfilled' }), /disagreement/); assert.throws(() => store.act(id, p.id, { action: 'reopened' }), /Explain/); store.act(id, p.id, { action: 'reopened', note: 'Scope now agreed.' }); store.act(id, p.id, { action: 'fulfilled' }); assert.equal(store.promise(id, p.id).status, 'fulfilled'); assert.equal(store.verify(id).valid, true); } finally { store.close(); }
});
test('backup restores original history into an empty account, rejects tampering and duplicates', () => {
  const store = new Store(':memory:'); try { const id = user(store); const other = user(store, 'other@example.org'); const p = store.create(id, promise()); store.act(id, p.id, { action: 'fulfilled', note: 'Done' }); const backup = store.export(id); const tampered = structuredClone(backup); tampered.promises[0].status = 'broken'; assert.throws(() => store.import(other, tampered), /history/); assert.equal(store.events(other).length, 0); const changed = structuredClone(backup); changed.events[0].data.promise.summary = 'Hacked'; assert.throws(() => store.import(other, changed), /integrity/); assert.equal(store.import(other, backup).count, 1); assert.equal(store.promises(other)[0].status, 'fulfilled'); assert.equal(store.events(other)[0].data.sourceHistory.length, 2); assert.equal(store.verify(other).valid, true); assert.throws(() => store.import(other, backup), /empty account/); } finally { store.close(); }
});
test('authentication hashes passwords, expires sessions and invalidates them on password change', () => {
  const store = new Store(':memory:'); try { const data = store.register({ name: 'Test', email: 'test@example.org', password: 'a strong password 123' }); assert.ok(store.authenticate(data.token)); assert.throws(() => store.login({ email: 'test@example.org', password: 'wrong password 123' }), /incorrect/); store.changePassword(data.user.id, 'a strong password 123', 'changed password 123'); assert.equal(store.authenticate(data.token), null); assert.ok(store.login({ email: 'test@example.org', password: 'changed password 123' }).token); const row = store.db.prepare('SELECT password FROM users').get(); assert.ok(!row.password.includes('changed password')); } finally { store.close(); }
});
test('local analysis finds English and Dutch commitments, distinguishes vague intent and ignores negation', () => {
  const result = analyzeText("Sarah: I'll send you the report by Friday. I might be able to help. Ik zal morgen de boodschappen doen. I will not help. Nice weather today. Will you call me?"); assert.equal(result.commitments.length, 3); assert.equal(result.commitments[0].speaker, 'Sarah'); assert.equal(result.commitments[0].suggestedDeadline, 'by Friday'); assert.equal(result.commitments[1].committalType, 'non_committal'); assert.equal(result.commitments[2].suggestedDeadline, 'morgen'); assert.ok(result.commitments[1].nudge);
});
test('clarifying an agreement preserves original words and requires renewed confirmation', () => {
  const store = new Store(':memory:'); try { const id = user(store); const p = store.create(id, promise()); store.act(id, p.id, { action: 'amended', changes: promise({ summary: 'Send the revised report', originalText: 'Overwrite attempt' }), note: 'We clarified which report.' }); const result = store.promise(id, p.id); assert.equal(result.summary, 'Send the revised report'); assert.equal(result.originalText, p.originalText); assert.equal(result.status, 'draft'); assert.equal(result.createdAt, p.createdAt); assert.equal(store.events(id)[0].data.promise.summary, p.summary); assert.equal(store.verify(id).valid, true); } finally { store.close(); }
});
