import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.47.0/+esm';

let _supabase = null;

export function initSupabase(url, anonKey) {
  _supabase = createClient(url, anonKey);
  return _supabase;
}

export function getSupabase() {
  return _supabase;
}

let _authMode = 'signin';

export function setAuthMode(mode) {
  _authMode = mode;
  const signinTab = document.getElementById('authTabSignin');
  const signupTab = document.getElementById('authTabSignup');
  const btn = document.getElementById('authSubmitBtn');
  if (mode === 'signin') {
    signinTab.classList.add('auth-tab-active');
    signupTab.classList.remove('auth-tab-active');
    btn.textContent = 'Sign In';
    document.getElementById('authPassword').setAttribute('autocomplete', 'current-password');
  } else {
    signupTab.classList.add('auth-tab-active');
    signinTab.classList.remove('auth-tab-active');
    btn.textContent = 'Create Account';
    document.getElementById('authPassword').setAttribute('autocomplete', 'new-password');
  }
  _hideAuthMessages();
}

function _hideAuthMessages() {
  document.getElementById('authError').classList.add('hidden');
  document.getElementById('authInfo').classList.add('hidden');
}
function _showAuthError(msg) {
  _hideAuthMessages();
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function _showAuthInfo(msg) {
  _hideAuthMessages();
  const el = document.getElementById('authInfo');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function _setAuthLoading(loading) {
  const btn = document.getElementById('authSubmitBtn');
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
  btn.textContent = loading ? 'Please wait…' : (_authMode === 'signin' ? 'Sign In' : 'Create Account');
}

export async function handleAuthSubmit() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!email || !password) return;
  if (_authMode === 'signup' && password.length < 6) {
    _showAuthError('Password must be at least 6 characters.');
    return;
  }
  _hideAuthMessages();
  _setAuthLoading(true);
  try {
    if (_authMode === 'signin') {
      const { error } = await _supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { data, error } = await _supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data.user && !data.session) {
        _showAuthInfo('Account created! Check your email for a confirmation link, then sign in.');
        setAuthMode('signin');
      }
    }
  } catch (error) {
    _showAuthError(error.message || 'Something went wrong. Please try again.');
  } finally {
    _setAuthLoading(false);
  }
}

export async function sendPasswordReset() {
  const email = document.getElementById('authEmail').value.trim();
  if (!email) {
    _showAuthError('Enter your email above first, then click "Forgot password?".');
    return;
  }
  try {
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await _supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    _showAuthInfo('Password reset email sent. Check your inbox.');
  } catch (error) {
    _showAuthError(error.message || 'Could not send reset email.');
  }
}

export async function submitNewPassword() {
  const password = document.getElementById('newPasswordInput').value;
  const errorEl = document.getElementById('newPasswordError');
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
    const { error } = await _supabase.auth.updateUser({ password });
    if (error) throw error;
    document.getElementById('newPasswordModal').classList.add('hidden');
    document.getElementById('newPasswordInput').value = '';
    window.dispatchEvent(new Event('auth:passwordUpdated'));
  } catch (error) {
    errorEl.textContent = error.message || 'Could not update password.';
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}
