// Token storage — Supabase is a backend detail, invisible to the user.
const TOKEN_KEY   = 'ct_token';
const REFRESH_KEY = 'ct_refresh';
const EXPIRES_KEY = 'ct_expires';

export function saveSession({ access_token, refresh_token, expires_at }) {
  localStorage.setItem(TOKEN_KEY, access_token);
  if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
  if (expires_at)    localStorage.setItem(EXPIRES_KEY, String(expires_at));
}

export function clearSession() {
  [TOKEN_KEY, REFRESH_KEY, EXPIRES_KEY].forEach(k => localStorage.removeItem(k));
}

export function getAccessToken()  { return localStorage.getItem(TOKEN_KEY); }
export function getRefreshToken() { return localStorage.getItem(REFRESH_KEY); }

export function isTokenExpired() {
  const exp = localStorage.getItem(EXPIRES_KEY);
  if (!exp) return true;
  return Date.now() >= (parseInt(exp, 10) * 1000 - 60_000); // 1 min buffer
}

export function decodeUserFromToken(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

// Parses tokens from the URL hash after Supabase email redirects (invite, recovery, confirmation).
export function parseAuthHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  const p = new URLSearchParams(hash);
  const access_token = p.get('access_token');
  if (!access_token) return null;
  return {
    access_token,
    refresh_token: p.get('refresh_token') || '',
    expires_at:    parseInt(p.get('expires_at') || '0', 10),
    type:          p.get('type') || '',
  };
}

// ── UI ─────────────────────────────────────────────────────────────────────────

let _authMode = 'signin';

export function setAuthMode(mode) {
  _authMode = mode;
  document.getElementById('authSubmitBtn').textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
  document.getElementById('authPassword').setAttribute('autocomplete',
    mode === 'signin' ? 'current-password' : 'new-password');
  document.getElementById('forgotPasswordLink').classList.toggle('hidden', mode !== 'signin');
  document.getElementById('authSwitchToSignup').classList.toggle('hidden', mode !== 'signin');
  document.getElementById('authSwitchToSignin').classList.toggle('hidden', mode !== 'signup');
  _hideMessages();
}

function _hideMessages() {
  document.getElementById('authError').classList.add('hidden');
  document.getElementById('authInfo').classList.add('hidden');
}
function _showError(msg) {
  _hideMessages();
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function _showInfo(msg) {
  _hideMessages();
  const el = document.getElementById('authInfo');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function _setLoading(on) {
  const btn = document.getElementById('authSubmitBtn');
  btn.disabled = on;
  btn.classList.toggle('loading', on);
  if (!on) btn.textContent = _authMode === 'signin' ? 'Sign In' : 'Create Account';
  else btn.textContent = 'Please wait…';
}

export async function handleAuthSubmit() {
  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!email || !password) return;
  if (_authMode === 'signup' && password.length < 6) {
    _showError('Password must be at least 6 characters.');
    return;
  }
  _hideMessages();
  _setLoading(true);
  try {
    const endpoint = _authMode === 'signin' ? '/auth/signin' : '/auth/signup';
    const res = await fetch(`/api${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    if (_authMode === 'signup') {
      document.getElementById('authPassword').value = '';
      setAuthMode('signin');
      _showInfo('Account created! Please sign in.');
      return;
    }
    saveSession(data);
    window.dispatchEvent(new CustomEvent('auth:signedIn', {
      detail: { userId: data.userId, email: data.email },
    }));
  } catch (e) {
    _showError(e.message || 'Something went wrong. Please try again.');
  } finally {
    _setLoading(false);
  }
}

export async function sendPasswordReset() {
  const email = document.getElementById('authEmail').value.trim();
  if (!email) { _showError('Enter your email above first.'); return; }
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, redirectTo: window.location.origin + window.location.pathname }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    _showInfo('Password reset email sent. Check your inbox.');
  } catch (e) {
    _showError(e.message || 'Could not send reset email.');
  }
}

export async function submitNewPassword() {
  const password = document.getElementById('newPasswordInput').value;
  const errorEl  = document.getElementById('newPasswordError');
  errorEl.classList.add('hidden');
  if (password.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters.';
    errorEl.classList.remove('hidden');
    return;
  }
  const btn = document.getElementById('newPasswordBtn');
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    const res = await fetch('/api/auth/update-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    clearSession();
    document.getElementById('newPasswordModal').classList.add('hidden');
    document.getElementById('newPasswordInput').value = '';
    // Show auth screen with success message
    window.dispatchEvent(new CustomEvent('auth:passwordUpdated'));
  } catch (e) {
    errorEl.textContent = e.message || 'Could not update password.';
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}
