import { getAccessToken, getRefreshToken, isTokenExpired, saveSession, clearSession } from './auth.js';

let _refreshPromise = null;
let _activeColivingId = null;
export function setActiveColiving(id) { _activeColivingId = id; }

async function _token() {
  if (!isTokenExpired()) return getAccessToken();
  const rt = getRefreshToken();
  if (!rt) return null;
  if (!_refreshPromise) {
    _refreshPromise = fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('refresh failed')))
      .then(data => { saveSession(data); return data.access_token; })
      .catch(() => { clearSession(); return null; })
      .finally(() => { _refreshPromise = null; });
  }
  return _refreshPromise;
}

async function _fetch(path, options = {}) {
  const token = await _token();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(_activeColivingId ? { 'X-Coliving-Id': _activeColivingId } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new Event('auth:expired'));
    throw new Error('Session expired. Please sign in again.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export const fetchMe            = () => _fetch('/me');
export const checkPendingInvite = () => _fetch('/invitations/pending');
export const fetchMembers       = () => _fetch('/colivings/members');

export const createColiving  = (name) =>
  _fetch('/colivings', { method: 'POST', body: JSON.stringify({ name }) });

export const updateColiving  = (data) =>
  _fetch('/colivings', { method: 'PUT', body: JSON.stringify(data) });

export const deleteColiving  = () =>
  _fetch('/colivings', { method: 'DELETE' });

export const sendInvite      = (email) =>
  _fetch('/invitations', { method: 'POST', body: JSON.stringify({ email, redirectTo: window.location.origin }) });

export const acceptInvite    = (invitationId) =>
  _fetch('/invitations/accept', { method: 'POST', body: JSON.stringify({ invitationId }) });

export const linkPerson      = (personId) =>
  _fetch('/me/link-person', { method: 'POST', body: JSON.stringify({ personId }) });

export const leaveColiving   = (colivingId) =>
  _fetch('/me/leave', { method: 'POST', body: JSON.stringify({ colivingId }), headers: { 'X-Coliving-Id': colivingId } });

export const removeMember    = (memberId) =>
  _fetch('/colivings/members', { method: 'DELETE', body: JSON.stringify({ memberId }) });

export const generateInviteCode = (colivingId) =>
  _fetch('/invite-codes', { method: 'POST', body: JSON.stringify({ colivingId }), headers: { 'X-Coliving-Id': '' } });

export const previewInviteCode = (code) =>
  _fetch(`/invite-codes/preview?code=${encodeURIComponent(code)}`, { headers: { 'X-Coliving-Id': '' } });

export const joinByCode = (code) =>
  _fetch('/invite-codes/join', { method: 'POST', body: JSON.stringify({ code }), headers: { 'X-Coliving-Id': '' } });

export const updateProfile = (displayName) =>
  _fetch('/profile', { method: 'PUT', body: JSON.stringify({ displayName }), headers: { 'X-Coliving-Id': '' } });

export async function loadAllData() {
  const [people, trashData, cleaningData, birthdays, vitalnya] = await Promise.all([
    _fetch('/people'),
    _fetch('/trash'),
    _fetch('/cleaning'),
    _fetch('/birthdays'),
    _fetch('/vitalnya'),
  ]);
  return { people, trashData, cleaningData, birthdays, vitalnya };
}

export const apiAddPerson    = (name) =>
  _fetch('/people', { method: 'POST', body: JSON.stringify({ name }) });

export const apiRemovePerson = (id) =>
  _fetch('/people', { method: 'DELETE', body: JSON.stringify({ id }) });

export const apiTrash        = (action, data) =>
  _fetch('/trash', { method: 'POST', body: JSON.stringify({ action, ...data }) });

export const apiCleaning     = (action, data) =>
  _fetch('/cleaning', { method: 'POST', body: JSON.stringify({ action, ...data }) });

export const apiSetBirthday  = (personId, date) =>
  _fetch('/birthdays', { method: 'POST', body: JSON.stringify({ personId, date }) });

export const apiAddVitalnyaBooking = (data) =>
  _fetch('/vitalnya', { method: 'POST', body: JSON.stringify(data) });

export const apiRemoveVitalnyaBooking = (id) =>
  _fetch('/vitalnya', { method: 'DELETE', body: JSON.stringify({ id }) });
