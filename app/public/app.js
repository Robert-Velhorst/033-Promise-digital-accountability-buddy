import { request, session, setSession, escape as e } from './api.js';
import * as views from './views.js';
import { startCapture, stopCapture, installSpeech } from './capture.js';
import { renderConversations } from './conversation-ui.js';
import { installConversationHandlers } from './conversation-actions.js';
const app = document.querySelector('#app'); const dialog = document.querySelector('#editor');
let state, authMode = 'register', transcript = '', analysis = null, listening = false, captureTimer, poll;
let filters = { q: '', status: '', direction: '', sort: 'newest' };
const conversationFilters = { q: '', status: '' };
let desktopEnabled = localStorage.getItem('promise-desktop') === 'yes';
const announced = new Set();
const nav = [['dashboard', 'Vandaag', 'dashboard'], ['agreements', 'Afspraken', 'ledger'], ['followup', 'Opvolging', 'bell'], ['connections', 'Communicatie', 'capture'], ['ledger', 'Handmatige dossiers', 'ledger'], ['capture', 'Los gesprek analyseren', 'capture'], ['reminders', 'Herinneringen', 'bell'], ['settings', 'Instellingen', 'settings']];
function toast(message, error = false) { const node = document.querySelector('#toast'); node.textContent = message; node.className = error ? 'visible error' : 'visible'; clearTimeout(toast.timer); toast.timer = setTimeout(() => { node.className = ''; }, 5500); }
function route() { return (location.hash.slice(1) || 'dashboard').split('/'); }
function showAuth() {
  const register = authMode === 'register';
  app.innerHTML = `<main class="auth-layout"><section class="auth-intro"><a class="brand" href="#">${views.icon('shield')}<span>Promise</span></a><h1>Your word.<br>Worth keeping.</h1><p>Turn conversations into clear agreements.<br>Make follow-through a little easier.</p><div class="auth-values"><span>${views.icon('check')} Capture the agreement</span><span>${views.icon('clock')} Follow through in time</span><span>${views.icon('ledger')} Remember what changed</span></div><p class="auth-private">${views.icon('shield')} A private workspace on this computer.</p></section><section class="auth-card"><h2>${register ? 'Create your workspace' : 'Welcome back'}</h2><p>${register ? 'Your promises, with room for clarity.' : 'Continue where your agreements left off.'}</p><form id="auth-form">${register ? '<label>Your name<input name="name" autocomplete="name" maxlength="100" required autofocus></label>' : ''}<label>Email<input name="email" type="email" autocomplete="username" maxlength="250" required ${register ? '' : 'autofocus'}></label><label>Password<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="10" maxlength="200" required></label>${register ? '<p class="muted small">At least 10 characters. Save your password; this local account has no email recovery.</p>' : ''}<p class="form-error" role="alert"></p><button type="submit" class="primary wide">${register ? 'Create workspace' : 'Sign in'} ${views.icon('arrow')}</button></form><p class="auth-switch">${register ? 'Already have an account?' : 'New to Promise?'} <button class="text-button" data-do="auth-switch">${register ? 'Sign in' : 'Create an account'}</button></p></section></main>`;
}
function render() {
  if (!session.user) return showAuth(); if (!state) return;
  const [page, id] = route(); const unread = state.notifications.filter(n => !n.readAt).length;
  const content = ['dashboard','agreements','agreement','followup','connections'].includes(page) ? renderConversations(state, session.user, page, id, conversationFilters) : page === 'ledger' ? views.ledger(state, filters) : page === 'capture' ? views.capture(state, transcript, analysis) : page === 'promise' ? views.detail(state, id) : page === 'reminders' ? views.reminders(state) : page === 'settings' ? views.settings(state, session.user) : renderConversations(state, session.user, 'dashboard');
  app.innerHTML = `<div class="app-shell"><aside id="sidebar"><a class="brand" href="#dashboard">${views.icon('shield')}<span>Promise</span></a><p class="nav-label">Your commitments</p><nav aria-label="Main navigation">${nav.map(([key, text, icon]) => `<a href="#${key}" ${page === key || (page === 'promise' && key === 'ledger') ? 'aria-current="page" class="selected"' : ''}>${views.icon(icon)}<span>${text}</span>${key === 'reminders' && unread ? `<span class="nav-count">${unread}</span>` : ''}</a>`).join('')}</nav><div class="sidebar-bottom"><div class="local-status"><span></span> Saved on this device</div><div class="account"><span class="avatar">${e(session.user.name.charAt(0).toUpperCase())}</span><div><strong>${e(session.user.name)}</strong><span>Personal workspace</span></div><button class="icon-button" data-do="logout" title="Sign out" aria-label="Sign out">${views.icon('exit')}</button></div></div></aside><div class="workspace"><header class="topbar"><button class="icon-button mobile-menu" data-do="menu" aria-label="Toggle navigation">${views.icon('menu')}</button><span>${e(nav.find(n => n[0] === page)?.[1] || 'Promise details')}</span><div class="topbar-actions"><span class="privacy-label">${views.icon('shield')} Private by default</span><a class="icon-button" href="#reminders" aria-label="Reminders${unread ? `, ${unread} unread` : ''}">${views.icon('bell')}${unread ? '<span class="notification-dot"></span>' : ''}</a></div></header><main id="main" tabindex="-1">${content}</main><footer>Promise <span>Clear words. Thoughtful follow-through.</span></footer></div></div>`;
}
async function refresh(repaint = true) {
  state = await request('state');
  for (const n of state.notifications) {
    if (!n.readAt && !announced.has(n.id)) {
      announced.add(n.id);
      if (desktopEnabled && window.Notification?.permission === 'granted') { const alert = new Notification('Promise', { body: n.message, tag: n.id, icon: '/icon.svg' }); alert.onclick = () => { window.focus(); location.hash = n.promiseId ? `${n.kind === 'agreement_due' ? 'agreement' : 'promise'}/${n.promiseId}` : 'reminders'; }; }
    }
  }
  if (repaint) render();
}
async function afterLogin(data) { setSession(data); for (const n of (await request('state')).notifications) announced.add(n.id); await refresh(); clearInterval(poll); poll = setInterval(() => refresh(!['capture','settings','connections','followup'].includes(route()[0]) && !dialog.open).catch(handleError), 30000); }
function handleError(err) { if (err.status === 401) { stopCapture(); listening = false; clearInterval(poll); setSession({ user: null }); showAuth(); } toast(err.message, true); }
function download(data, name, type) { const url = URL.createObjectURL(new Blob([data], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function openEditor(candidate = null, amendId = null) {
  const defaults = candidate || {};
  dialog.innerHTML = `<form id="promise-form"><div class="modal-heading"><div><h2 id="editor-title">${candidate ? 'Review the promise' : 'A clear agreement'}</h2><p>Make sure this reflects what was actually agreed.</p></div><button type="button" class="icon-button" data-do="close" aria-label="Close">${views.icon('close')}</button></div><label>What will be done?<textarea name="summary" maxlength="1000" rows="2" required autofocus>${e(defaults.summary || '')}</textarea></label><div class="form-grid"><label>This promise is<select name="direction"><option value="given">Made by me</option><option value="received">Received from someone</option><option value="self">For myself</option></select></label><label>Other person<input name="person" maxlength="100" value="${e(defaults.speaker || '')}" required list="known-people"></label></div><datalist id="known-people">${[...new Set(state.promises.map(p => p.person).filter(Boolean))].map(p => `<option value="${e(p)}"></option>`).join('')}</datalist><div class="form-grid"><label>Agreed deadline <span class="muted">(optional)</span><input name="deadline" type="datetime-local"></label><label>Significance<select name="spectrumLevel">${views.levels.slice(1).map((label, i) => `<option value="${i + 1}" ${defaults.spectrumLevel === i + 1 || (!defaults.spectrumLevel && i === 1) ? 'selected' : ''}>${i + 1} · ${label}</option>`).join('')}</select></label></div>${candidate?.suggestedDeadline ? `<p class="muted small">Time mentioned: ${e(candidate.suggestedDeadline)}. Set the exact agreed date above.</p>` : ''}<label>Original words<textarea name="originalText" rows="2" maxlength="5000">${e(defaults.text || '')}</textarea></label><label>Tags <span class="muted">(comma separated)</span><input name="tags" maxlength="480" placeholder="Home, work, family…"></label><label>Agreement note <span class="muted">(required for level 4–5 confirmation)</span><textarea name="agreementNote" rows="2" maxlength="2000" placeholder="What was agreed, and how did the other person confirm it?"></textarea></label><label class="check"><input name="confirmed" type="checkbox"> The agreement is clear and I have confirmed the meaning.</label><p class="muted small">Leave unchecked to save a draft. Confirmation is your own record.</p><input name="source" type="hidden" value="${candidate ? 'reviewed transcript' : 'manual'}"><p class="form-error" role="alert"></p><div class="modal-footer"><button type="button" class="secondary" data-do="close">Cancel</button><button type="submit" class="primary">Save promise ${views.icon('check')}</button></div></form>`;
  const form = dialog.querySelector('form');
  const timezone = document.createElement('p'); timezone.className = 'muted small'; timezone.textContent = `Enter the deadline in your device’s time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`; form.elements.deadline.parentElement.append(timezone);
  for (const select of dialog.querySelectorAll('select')) select.setAttribute('aria-label', select.name === 'direction' ? 'This promise is' : 'Significance');
  if (amendId) {
    const p = state.promises.find(x => x.id === amendId); form.dataset.amendId = amendId;
    dialog.querySelector('#editor-title').textContent = 'Clarify the agreement';
    form.elements.direction.value = p.direction; form.elements.person.value = p.person; form.elements.person.required = p.direction !== 'self'; form.elements.person.disabled = p.direction === 'self';
    form.elements.originalText.value = p.originalText; form.elements.originalText.readOnly = true;
    form.elements.tags.value = p.tags.join(', '); form.elements.spectrumLevel.value = String(p.spectrumLevel);
    if (p.deadlineAt) { const d = new Date(p.deadlineAt); const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000); form.elements.deadline.value = local.toISOString().slice(0, 16); }
    form.elements.agreementNote.required = true; form.elements.agreementNote.placeholder = 'Explain what was clarified. The updated agreement will need confirmation.';
    form.elements.confirmed.closest('label').hidden = true;
  }
  dialog.showModal();
}
function actionEditor(id, action) {
  const titles = { fulfilled: 'Record a promise kept', broken: 'Record a promise not kept', cancelled: 'Cancel this promise', extended: 'Agree on a new deadline', confirmed: 'Record the confirmation', commented: 'Add a note', disputed: 'Record the disagreement', reopened: 'Reopen this promise' };
  const requireNote = ['extended', 'disputed', 'reopened', 'commented'].includes(action) || (action === 'confirmed' && state.promises.find(p => p.id === id)?.spectrumLevel >= 4);
  dialog.innerHTML = `<form id="action-form"><div class="modal-heading"><div><h2 id="editor-title">${titles[action]}</h2><p>The original agreement stays in the history.</p></div><button type="button" class="icon-button" data-do="close" aria-label="Close">${views.icon('close')}</button></div><input type="hidden" name="id" value="${e(id)}"><input type="hidden" name="action" value="${action}">${action === 'extended' ? '<label>New agreed deadline<input type="datetime-local" name="deadline" required autofocus></label>' : ''}<label>${action === 'extended' ? 'What new agreement did you make?' : action === 'fulfilled' ? 'What was completed? (optional)' : action === 'commented' ? 'Note or evidence reference' : 'Explanation'}<textarea name="note" rows="4" maxlength="2000" ${requireNote ? 'required' : ''} ${action !== 'extended' ? 'autofocus' : ''}></textarea></label>${action === 'confirmed' ? '<p class="muted small">This records your understanding of the agreement. It does not verify the other person’s identity.</p>' : ''}<p class="form-error" role="alert"></p><div class="modal-footer"><button type="button" class="secondary" data-do="close">Go back</button><button type="submit" class="primary">${action === 'commented' ? 'Save note' : 'Record change'}</button></div></form>`; dialog.showModal();
}
let analyzing = false;
async function analyze(live = false) {
  const text = document.querySelector('#transcript')?.value ?? transcript; transcript = text;
  if (!text.trim()) { if (!live) toast('Enter some conversation text first.', true); return; } if (analyzing) return;
  analyzing = true; const button = document.querySelector('[data-do="analyze"]'); if (button) button.disabled = true;
  try { analysis = await request('analyze', { text }); if (route()[0] === 'capture') document.querySelector('#analysis-results').innerHTML = views.analysisResults(analysis, state.prefs); } finally { analyzing = false; if (button) button.disabled = false; }
}
async function toggleListen() {
  if (listening) { listening = false; stopCapture(); const button = document.querySelector('#listen-button'); if (button) button.innerHTML = `${views.icon('capture')} Start listening`; return; }
  if (!document.querySelector('#capture-consent')?.checked) throw new Error('Confirm that everyone present knows and agrees before listening.');
  await startCapture(document.querySelector('#speech-language').value, (final, interim) => {
    transcript = (transcript + ' ' + final).trim().slice(0, 20000); const field = document.querySelector('#transcript'); if (field) field.value = transcript; const interimNode = document.querySelector('#interim'); if (interimNode) interimNode.textContent = interim;
    if (final) { clearTimeout(captureTimer); captureTimer = setTimeout(() => analyze(true).catch(handleError), 1200); }
  }, (text, active) => { listening = active; const node = document.querySelector('#capture-status'); if (node) node.textContent = text; const button = document.querySelector('#listen-button'); if (button) button.innerHTML = `${views.icon('capture')} ${active ? 'Stop listening' : 'Start listening'}`; });
}
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-do]'); if (!button) return; const action = button.dataset.do;
  try {
    if (action === 'auth-switch') { authMode = authMode === 'register' ? 'login' : 'register'; showAuth(); }
    if (action === 'new') openEditor();
    if (action === 'close') dialog.close();
    if (action === 'review') openEditor(analysis.commitments[Number(button.dataset.index)]);
    if (action === 'act') actionEditor(button.dataset.id, button.dataset.action);
    if (action === 'amend') { const p = state.promises.find(x => x.id === button.dataset.id); openEditor({ summary: p.summary, spectrumLevel: p.spectrumLevel }, p.id); }
    if (action === 'analyze') await analyze();
    if (action === 'example') { transcript = "Sarah: I'll send you the report by Friday.\nMe: I might be able to help with the presentation.\nMe: Ik zal morgen de boodschappen doen."; document.querySelector('#transcript').value = transcript; }
    if (action === 'listen') await toggleListen();
    if (action === 'install-speech') { toast('The browser will download the local speech language pack.'); await installSpeech(document.querySelector('#speech-language').value); toast('Language installed. You can start listening.'); }
    if (action === 'menu') document.querySelector('#sidebar').classList.toggle('mobile-open');
    if (action === 'logout') { stopCapture(); listening = false; clearInterval(poll); await request('logout', {}); setSession({ user: null }); state = null; transcript = ''; analysis = null; showAuth(); }
    if (action === 'read' || action === 'read-all') { await request('read', action === 'read' ? { id: button.dataset.id } : {}); await refresh(); }
    if (action === 'test-notification') { await request('test-notification', {}); await refresh(); toast('Test reminder added.'); }
    if (action === 'desktop-notification') { if (!window.Notification) throw new Error('Desktop notifications are not supported by this browser.'); const permission = await Notification.requestPermission(); desktopEnabled = permission === 'granted'; localStorage.setItem('promise-desktop', desktopEnabled ? 'yes' : 'no'); toast(desktopEnabled ? 'Desktop notifications enabled while this page is open.' : 'Permission not granted. In-app reminders still work.'); }
    if (action === 'export') download(JSON.stringify(await request('export'), null, 2), `Promise-Backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    if (action === 'csv') { const cell = x => `"${String(x ?? '').replace(/^[=+@-]/, "'").replaceAll('"', '""')}"`; const rows = [['Action', 'Direction', 'Person', 'Status', 'Level', 'Deadline UTC', 'Tags'], ...state.promises.map(p => [p.summary, p.direction, p.person, p.status, p.spectrumLevel, p.deadlineAt ? new Date(p.deadlineAt).toISOString() : '', p.tags.join(', ')])]; download('\uFEFF' + rows.map(r => r.map(cell).join(',')).join('\r\n'), 'Promise-Ledger.csv', 'text/csv'); }
    if (action === 'calendar') { const clean = x => String(x).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\r/g, ''); const utc = t => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); const events = state.promises.filter(p => p.deadlineAt && ['active', 'overdue'].includes(p.status)); download(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Promise//Personal Ledger//EN', ...events.flatMap(p => ['BEGIN:VEVENT', `UID:${p.id}@promise.local`, `DTSTAMP:${utc(Date.now())}`, `DTSTART:${utc(p.deadlineAt)}`, `SUMMARY:${clean(p.summary)}`, `DESCRIPTION:${clean(p.originalText)}`, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n') + '\r\n', 'Promise-Deadlines.ics', 'text/calendar'); }
  } catch (err) { handleError(err); }
});
document.addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target; const input = Object.fromEntries(new FormData(form)); const submit = form.querySelector('button[type="submit"]'); const error = form.querySelector('.form-error'); if (submit) submit.disabled = true; if (error) error.textContent = '';
  try {
    if (form.getAttribute('id') === 'auth-form') await afterLogin(await request(authMode, input));
    if (form.getAttribute('id') === 'promise-form') { const changes = { ...input, spectrumLevel: Number(input.spectrumLevel), tags: input.tags.split(',').map(t => t.trim()).filter(Boolean), confirmed: form.elements.confirmed.checked, deadlineAt: input.deadline ? new Date(input.deadline).getTime() : null }; const p = form.dataset.amendId ? await request('action', { id: form.dataset.amendId, action: 'amended', changes, note: input.agreementNote }) : await request('promises', changes); dialog.close(); await refresh(false); if (location.hash === `#promise/${p.id}`) render(); else location.hash = `promise/${p.id}`; toast(p.status === 'draft' ? 'Draft saved. Confirm when the agreement is clear.' : 'Promise saved.'); }
    if (form.getAttribute('id') === 'action-form') { await request('action', { ...input, deadlineAt: input.deadline ? new Date(input.deadline).getTime() : undefined }); dialog.close(); await refresh(); toast('Change added to the promise history.'); }
    if (form.getAttribute('id') === 'preferences-form') { await request('preferences', { ...input, overdueAlerts: form.elements.overdueAlerts.checked, dueSoonAlerts: form.elements.dueSoonAlerts.checked, nudgeAlerts: form.elements.nudgeAlerts.checked, dueSoonHours: Number(input.dueSoonHours) }); await refresh(); toast('Preferences saved.'); }
    if (form.getAttribute('id') === 'password-form') { await request('password', input); clearInterval(poll); setSession({ user: null }); authMode = 'login'; showAuth(); toast('Password changed. Sign in again.'); }
  } catch (err) { if (error) error.textContent = err.message; else handleError(err); } finally { if (submit) submit.disabled = false; }
});
document.addEventListener('input', event => {
  if (event.target.id === 'transcript') transcript = event.target.value;
  if (event.target.id === 'search') { filters.q = event.target.value; const start = event.target.selectionStart; render(); const search = document.querySelector('#search'); search.focus(); search.setSelectionRange(start, start); }
});
document.addEventListener('change', async event => {
  const field = event.target;
  if (field.id.endsWith('-filter')) { filters[field.id.split('-')[0]] = field.value; render(); }
  if (field.name === 'direction' && field.closest('#promise-form')) { const person = field.form.elements.person; person.required = field.value !== 'self'; person.disabled = field.value === 'self'; }
  try {
    if (field.id === 'transcript-file' && field.files[0]) { if (field.files[0].size > 80000) throw new Error('Import a text file of up to 80 KB.'); transcript = (await field.files[0].text()).slice(0, 20000); render(); }
    if (field.id === 'backup-file' && field.files[0]) { if (field.files[0].size > 8 * 1024 * 1024) throw new Error('Backup is larger than 8 MB.'); const data = JSON.parse(await field.files[0].text()); const result = await request('import', data); await refresh(); toast(`Restored ${result.count} promises with their original history preserved.`); }
  } catch (err) { handleError(err); }
});
window.addEventListener('hashchange', () => { stopCapture(); listening = false; clearTimeout(captureTimer); if (dialog.open) dialog.close(); render(); document.querySelector('#main')?.focus(); });
window.addEventListener('pagehide', stopCapture);
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopCapture(); listening = false; const button = document.querySelector('#listen-button'); if (button) button.innerHTML = `${views.icon('capture')} Start listening`; const status = document.querySelector('#capture-status'); if (status) status.textContent = 'Microphone stopped because this page is hidden.'; } });
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
installConversationHandlers({ getState: () => state, refresh, render, filters: conversationFilters, toast, handleError, dialog });
try { const data = await request('me'); if (data.user) await afterLogin(data); else showAuth(); } catch (err) { app.innerHTML = '<main class="empty"><h1>Promise could not open</h1><p>Make sure the local server is running, then reload this page.</p></main>'; toast(err.message, true); }


