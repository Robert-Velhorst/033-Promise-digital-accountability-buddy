export let session = { user: null, csrf: '' };
export function setSession(value) { session = value; }
export async function request(path, data) {
  const res = await fetch('/api/' + path, { method: data === undefined ? 'GET' : 'POST', headers: data === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf || '' }, credentials: 'same-origin', body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await res.json(); if (!res.ok) { const e = new Error(result.error || 'Request failed.'); e.status = res.status; throw e; } return result;
}
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function date(value, timezone = 'Europe/Amsterdam', full = false) { return value ? new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: 'numeric', month: 'short', year: full ? 'numeric' : undefined, hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'No deadline agreed'; }
