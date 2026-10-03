import { getSupabase } from './auth.js';

async function _token() {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

async function _fetch(path, options = {}) {
  const token = await _token();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export const fetchConfig = () => _fetch('/config');

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

export const apiAddPerson = (name) =>
  _fetch('/people', { method: 'POST', body: JSON.stringify({ name }) });

export const apiRemovePerson = (id) =>
  _fetch('/people', { method: 'DELETE', body: JSON.stringify({ id }) });

export const apiTrash = (action, data) =>
  _fetch('/trash', { method: 'POST', body: JSON.stringify({ action, ...data }) });

export const apiCleaning = (action, data) =>
  _fetch('/cleaning', { method: 'POST', body: JSON.stringify({ action, ...data }) });

export const apiSetBirthday = (personId, date) =>
  _fetch('/birthdays', { method: 'POST', body: JSON.stringify({ personId, date }) });

export const apiAddVitalnyaBooking = (data) =>
  _fetch('/vitalnya', { method: 'POST', body: JSON.stringify(data) });

export const apiRemoveVitalnyaBooking = (id) =>
  _fetch('/vitalnya', { method: 'DELETE', body: JSON.stringify({ id }) });
