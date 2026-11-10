import { state } from './state.js';
import {
  setAuthMode, handleAuthSubmit, sendPasswordReset, submitNewPassword,
  saveSession, clearSession, getAccessToken, getRefreshToken, isTokenExpired,
  decodeUserFromToken, parseAuthHash,
} from './auth.js';
import {
  fetchMe, checkPendingInvite, fetchMembers,
  createColiving, updateColiving, sendInvite, acceptInvite, leaveColiving, removeMember,
  loadAllData,
  apiAddPerson, apiRemovePerson,
  apiTrash, apiCleaning,
  apiSetBirthday, apiAddVitalnyaBooking, apiRemoveVitalnyaBooking,
} from './api.js';
import { buildCleaningScheduleMap, todayLocalDateKey } from './utils.js';
import { renderPeople } from './tabs/people.js';
import { renderTrash } from './tabs/trash.js';
import { renderCleaning } from './tabs/cleaning.js';
import { renderBirthdays } from './tabs/birthdays.js';
import { renderVitalnya } from './tabs/vitalnya.js';

window.app = {
  // Auth
  setAuthMode, handleAuthSubmit, sendPasswordReset, submitNewPassword, signOut,
  togglePasswordVisibility(inputId, eyeId) {
    const input = document.getElementById(inputId);
    const eye   = document.getElementById(eyeId);
    const show  = input.type === 'password';
    input.type  = show ? 'text' : 'password';
    eye.innerHTML = show
      ? `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/>
      `
      : `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
      `;
  },
  // Onboarding
  submitCreateColiving, submitAcceptInvite, goToCreateColiving,
  // Settings
  openSettings, closeSettings, saveColivingSettings, submitInviteMember, kickMember, submitLeaveColiving,
  // App
  switchTab,
  addPerson, removePerson,
  markTrashDone, unmarkTrashDone, addToTrashQueue, removeFromTrashQueue, insertIntoTrashQueue, toggleInsertMenu,
  createCleaningGroup, removeCleaningGroup, saveCleaningSettings,
  changeMonth, showPostponeModal, hidePostponeModal, confirmPostpone, cancelPostponement,
  setBirthday,
  addVitalnyaBooking, removeVitalnyaBooking,
};

// ── Screen management ──────────────────────────────────────────────────────────

function _showOnly(id) {
  ['loadingScreen', 'authScreen', 'onboardingScreen', 'appScreen'].forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}

function showAuthScreen() {
  _showOnly('authScreen');
  document.getElementById('authPassword').value = '';
}

function showOnboarding(mode, inviteData = null) {
  _showOnly('onboardingScreen');
  const createEl = document.getElementById('onboardingCreate');
  const acceptEl = document.getElementById('onboardingAccept');
  if (mode === 'accept' && inviteData) {
    createEl.classList.add('hidden');
    acceptEl.classList.remove('hidden');
    document.getElementById('inviteColivingName').textContent = inviteData.colivingName;
    document.getElementById('acceptInviteBtn').dataset.inviteId = inviteData.id;
  } else {
    createEl.classList.remove('hidden');
    acceptEl.classList.add('hidden');
  }
}

async function showAppScreen() {
  _showOnly('appScreen');
  document.getElementById('appColivingName').textContent = state.colivingName;
  await refreshData();
}

// ── Auth state machine ─────────────────────────────────────────────────────────

let _activeUserId = null;

async function handleSignedIn(user) {
  _activeUserId = user.id;
  state.userId = user.id;
  state.userEmail = user.email;

  let membership;
  try {
    membership = await fetchMe();
  } catch {
    membership = null;
  }

  if (!membership) {
    // Not in any coliving — check for pending invite
    let invite = null;
    try { invite = await checkPendingInvite(); } catch {}
    if (invite) {
      showOnboarding('accept', invite);
    } else {
      showOnboarding('create');
    }
    return;
  }

  state.colivingId = membership.colivingId;
  state.colivingName = membership.colivingName;
  state.isOwner = membership.role === 'owner';
  state.linkedPersonId = membership.linkedPersonId;
  await showAppScreen();
}

export async function signOut() {
  _activeUserId = null;
  try {
    await fetch('/api/auth/signout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
    });
  } catch {}
  clearSession();
  showAuthScreen();
}

// ── Onboarding ─────────────────────────────────────────────────────────────────

async function submitCreateColiving() {
  const nameInput = document.getElementById('colivingNameInput');
  const name = nameInput.value.trim();
  if (!name) return;
  const btn = document.getElementById('createColivingBtn');
  btn.disabled = true;
  btn.textContent = 'Creating…';
  try {
    const result = await createColiving(name);
    state.colivingId = result.colivingId;
    state.colivingName = result.colivingName;
    state.isOwner = true;
    state.linkedPersonId = null;
    await showAppScreen();
  } catch (e) {
    alert('Error: ' + e.message);
    btn.disabled = false;
    btn.textContent = 'Create Flat';
  }
}

async function submitAcceptInvite() {
  const btn = document.getElementById('acceptInviteBtn');
  const invitationId = parseInt(btn.dataset.inviteId);
  btn.disabled = true;
  btn.textContent = 'Joining…';
  try {
    const result = await acceptInvite(invitationId);
    state.colivingId = result.colivingId;
    state.colivingName = result.colivingName;
    state.isOwner = false;
    state.linkedPersonId = null;
    await showAppScreen();
  } catch (e) {
    alert('Error: ' + e.message);
    btn.disabled = false;
    btn.textContent = 'Join Flat';
  }
}

function goToCreateColiving() {
  showOnboarding('create');
}


// ── Settings modal ─────────────────────────────────────────────────────────────

async function openSettings() {
  const modal = document.getElementById('settingsModal');
  modal.classList.remove('hidden');
  _renderSettings(null); // show loading state
  try {
    const [members, colivingData] = await Promise.all([
      fetchMembers(),
      fetchMe(),
    ]);
    state.members = members;
    _renderSettings(colivingData);
  } catch (e) {
    document.getElementById('settingsBody').innerHTML =
      `<p class="text-red-500 text-sm p-4">Error loading settings: ${e.message}</p>`;
  }
}

function closeSettings() {
  document.getElementById('settingsModal').classList.add('hidden');
}

function _renderSettings(colivingData) {
  const body = document.getElementById('settingsBody');
  if (!colivingData) {
    body.innerHTML = '<p class="text-gray-400 text-sm p-4 text-center">Loading…</p>';
    return;
  }

  const memberRows = state.members.map(m => {
    const personName = state.people.find(p => p.id === m.linkedPersonId)?.name || '—';
    const isSelf = m.email === state.userEmail;
    const canKick = state.isOwner && !isSelf;
    return `
      <tr class="border-t border-gray-100">
        <td class="py-2 pr-3 text-sm text-gray-800">${m.email}${isSelf ? ' <span class="text-xs text-indigo-500">(you)</span>' : ''}</td>
        <td class="py-2 pr-3 text-sm text-gray-600">${personName}</td>
        <td class="py-2 pr-3 text-sm text-gray-500">${m.role}</td>
        <td class="py-2 text-right">
          ${canKick ? `<button onclick="window.app.kickMember(${m.id})" class="text-xs text-red-500 hover:text-red-700">Remove</button>` : ''}
        </td>
      </tr>`;
  }).join('');

  const ownerSection = state.isOwner ? `
    <div class="border-t border-gray-200 pt-4">
      <h3 class="font-semibold text-gray-800 mb-3">Invite Member</h3>
      <div class="flex gap-2">
        <input type="email" id="inviteEmailInput" placeholder="email@example.com"
               class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
        <button onclick="window.app.submitInviteMember()"
                class="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">Send Invite</button>
      </div>
      <div id="inviteMsg" class="hidden mt-2 text-sm"></div>
    </div>

    <div class="border-t border-gray-200 pt-4">
      <h3 class="font-semibold text-gray-800 mb-3">Telegram Notifications</h3>
      <p class="text-xs text-gray-500 mb-3">Bot token and chat ID are stored securely and used for daily notifications.</p>
      <div class="space-y-2">
        <input type="text" id="tgBotToken" placeholder="Bot token (e.g. 123456:ABC…)"
               class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
        <input type="text" id="tgChatId" placeholder="Chat ID (e.g. -1001234567890)"
               class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
        <button onclick="window.app.saveColivingSettings()"
                class="w-full px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">Save Settings</button>
      </div>
      <div id="settingsSaveMsg" class="hidden mt-2 text-sm"></div>
    </div>` : `
    <div class="border-t border-gray-200 pt-4">
      <button onclick="window.app.submitLeaveColiving()"
              class="w-full px-4 py-2 bg-red-50 text-red-600 border border-red-200 text-sm rounded-lg hover:bg-red-100">
        Leave this coliving
      </button>
    </div>`;

  body.innerHTML = `
    <div class="mb-4">
      <label class="block text-sm font-medium text-gray-700 mb-1">Flat name</label>
      <div class="flex gap-2">
        <input type="text" id="colivingNameEdit" value="${colivingData.colivingName}"
               ${state.isOwner ? '' : 'disabled'}
               class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50">
        ${state.isOwner ? `<button onclick="window.app.saveColivingSettings()"
               class="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200">Save</button>` : ''}
      </div>
    </div>

    <div class="mb-4">
      <h3 class="font-semibold text-gray-800 mb-2">Members</h3>
      <table class="w-full">
        <thead>
          <tr class="text-left text-xs text-gray-500">
            <th class="pb-1 pr-3">Email</th><th class="pb-1 pr-3">Person</th><th class="pb-1 pr-3">Role</th><th></th>
          </tr>
        </thead>
        <tbody>${memberRows}</tbody>
      </table>
    </div>

    ${ownerSection}`;
}

async function saveColivingSettings() {
  const nameEl = document.getElementById('colivingNameEdit');
  const tgBot = document.getElementById('tgBotToken');
  const tgChat = document.getElementById('tgChatId');
  const msgEl = document.getElementById('settingsSaveMsg');
  const updates = {};
  if (nameEl) updates.name = nameEl.value.trim();
  if (tgBot?.value.trim()) updates.telegramBotToken = tgBot.value.trim();
  if (tgChat?.value.trim()) updates.telegramChatId = tgChat.value.trim();
  try {
    await updateColiving(updates);
    if (updates.name) {
      state.colivingName = updates.name;
      document.getElementById('appColivingName').textContent = updates.name;
    }
    if (msgEl) {
      msgEl.textContent = 'Saved!';
      msgEl.className = 'text-green-600 text-sm mt-2';
      msgEl.classList.remove('hidden');
      setTimeout(() => msgEl.classList.add('hidden'), 2000);
    }
  } catch (e) {
    if (msgEl) {
      msgEl.textContent = 'Error: ' + e.message;
      msgEl.className = 'text-red-500 text-sm mt-2';
      msgEl.classList.remove('hidden');
    }
  }
}

async function submitInviteMember() {
  const input = document.getElementById('inviteEmailInput');
  const msgEl = document.getElementById('inviteMsg');
  const email = input.value.trim();
  if (!email) return;
  try {
    await sendInvite(email);
    input.value = '';
    msgEl.textContent = `Invite sent to ${email}`;
    msgEl.className = 'text-green-600 text-sm mt-2';
    msgEl.classList.remove('hidden');
  } catch (e) {
    msgEl.textContent = 'Error: ' + e.message;
    msgEl.className = 'text-red-500 text-sm mt-2';
    msgEl.classList.remove('hidden');
  }
}

async function kickMember(memberId) {
  if (!confirm('Remove this member from the coliving?')) return;
  try {
    await removeMember(memberId);
    await openSettings(); // refresh
  } catch (e) { alert('Error: ' + e.message); }
}

async function submitLeaveColiving() {
  if (!confirm('Leave this coliving? You will lose access to all shared data.')) return;
  try {
    await leaveColiving();
    state.colivingId = null;
    state.colivingName = '';
    state.isOwner = false;
    state.linkedPersonId = null;
    closeSettings();
    showOnboarding('create');
  } catch (e) { alert('Error: ' + e.message); }
}

// ── Data ───────────────────────────────────────────────────────────────────────

async function refreshData() {
  try {
    const { people, trashData, cleaningData, birthdays, vitalnya } = await loadAllData();
    state.people = people;
    state.trashQueue = trashData.queue;
    state.trashCompletion = trashData.completion;
    if (state.trashCompletion?.completed_date < todayLocalDateKey()) {
      state.trashCompletion = null;
    }
    state.cleaningGroups = cleaningData.groups;
    state.cleaningSettings = cleaningData.settings;
    state.cleaningPostponements = cleaningData.postponements;
    state.birthdays = birthdays;
    state.vitalnyaBookings = vitalnya;
    render();
  } catch (e) {
    console.error('Failed to load data:', e);
  }
}

// ── Render ─────────────────────────────────────────────────────────────────────

function render() {
  state.scheduleMap = buildCleaningScheduleMap();
  const content = document.getElementById('content');
  switch (state.currentTab) {
    case 'people':    content.innerHTML = renderPeople();    break;
    case 'trash':     content.innerHTML = renderTrash();     break;
    case 'cleaning':  content.innerHTML = renderCleaning();  break;
    case 'birthdays': content.innerHTML = renderBirthdays(); break;
    case 'vitalnya':  content.innerHTML = renderVitalnya();  break;
  }
}

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('[id^="tab-"]').forEach(t => t.classList.remove('tab-active'));
  document.getElementById(`tab-${tab}`).classList.add('tab-active');
  render();
}

// ── People ─────────────────────────────────────────────────────────────────────

async function addPerson() {
  const input = document.getElementById('newPersonName');
  const name = input.value.trim();
  if (!name) return;
  try {
    await apiAddPerson(name);
    input.value = '';
    await refreshData();
  } catch (e) { alert('Error adding person: ' + e.message); }
}

async function removePerson(id) {
  if (!confirm('Remove this person? They will also be removed from all queues and groups.')) return;
  try {
    await apiRemovePerson(id);
    await refreshData();
  } catch (e) { alert('Error removing person: ' + e.message); }
}

// ── Trash ──────────────────────────────────────────────────────────────────────

async function markTrashDone() {
  const currentPersonId = state.trashQueue[0]?.person_id;
  if (!currentPersonId) return;
  try {
    await apiTrash('markDone', { today: todayLocalDateKey(), currentPersonId, queue: state.trashQueue });
    await refreshData();
  } catch (e) { alert('Error marking trash done: ' + e.message); }
}

async function unmarkTrashDone() {
  try {
    await apiTrash('unmarkDone', {
      today: todayLocalDateKey(),
      completedById: state.trashCompletion?.completed_by,
      queue: state.trashQueue,
    });
    await refreshData();
  } catch (e) { alert('Error unmarking trash: ' + e.message); }
}

async function addToTrashQueue(personId) {
  try {
    await apiTrash('addToQueue', { personId, position: state.trashQueue.length });
    await refreshData();
  } catch (e) { alert('Error adding to queue: ' + e.message); }
}

async function removeFromTrashQueue(id) {
  try {
    await apiTrash('removeFromQueue', { id, remaining: state.trashQueue.filter(t => t.id !== id) });
    await refreshData();
  } catch (e) { alert('Error removing from queue: ' + e.message); }
}

async function insertIntoTrashQueue(personId, afterIndex) {
  try {
    await apiTrash('insertIntoQueue', { personId, afterIndex, currentQueue: state.trashQueue });
    await refreshData();
  } catch (e) { alert('Error inserting into queue: ' + e.message); }
}

function toggleInsertMenu(position) {
  document.getElementById(`insert-menu-${position}`)?.classList.toggle('hidden');
}

// ── Cleaning ───────────────────────────────────────────────────────────────────

async function createCleaningGroup() {
  const name = document.getElementById('newGroupName').value.trim();
  const memberIds = Array.from(document.querySelectorAll('.group-member-checkbox:checked'))
    .map(cb => parseInt(cb.value));
  if (!name || memberIds.length === 0) return;
  try {
    await apiCleaning('createGroup', { name, memberIds });
    document.getElementById('newGroupName').value = '';
    await refreshData();
  } catch (e) { alert('Error creating group: ' + e.message); }
}

async function removeCleaningGroup(id) {
  if (!confirm('Remove this cleaning group?')) return;
  try {
    await apiCleaning('removeGroup', { id, currentStartGroupId: state.cleaningSettings.start_group_id });
    await refreshData();
  } catch (e) { alert('Error removing group: ' + e.message); }
}

async function saveCleaningSettings() {
  const startDate = document.getElementById('cleaningStartDate').value;
  const startGroupId = parseInt(document.getElementById('cleaningStartGroup').value) || null;
  const changed = startDate !== state.cleaningSettings.start_date || startGroupId !== state.cleaningSettings.start_group_id;
  let clearPostponements = false;
  if (changed && state.cleaningPostponements.length > 0) {
    if (!confirm('Changing the schedule will clear all existing postponements. Continue?')) return;
    clearPostponements = true;
  }
  try {
    await apiCleaning('saveSettings', { startDate, startGroupId, clearPostponements });
    await refreshData();
  } catch (e) { alert('Error saving settings: ' + e.message); }
}

function changeMonth(delta) {
  state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + delta, 1);
  render();
}

let _pendingPostpone = null;

function showPostponeModal(dateKey, groupId) {
  const groupName = state.cleaningGroups.find(g => g.id === groupId)?.name || '';
  _pendingPostpone = { dateKey, groupId, groupName };
  const [year, month, day] = dateKey.split('-').map(Number);
  const formatted = new Date(year, month - 1, day)
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const minDate = new Date().toISOString().split('T')[0];
  document.getElementById('postponeModal').classList.remove('hidden');
  const content = document.getElementById('postponeModalContent');
  content.innerHTML = `
    <div class="mb-4 p-3 bg-purple-50 rounded-lg">
      <p class="text-sm text-gray-600">Group:</p>
      <p id="postponeGroupName" class="font-bold text-purple-700"></p>
      <p class="text-sm text-gray-600 mt-2">Originally scheduled:</p>
      <p class="font-medium text-gray-800">${formatted}</p>
    </div>
    <div class="mb-4">
      <label class="block text-sm text-gray-600 mb-2">Move to new date:</label>
      <input type="date" id="postponeNewDate" min="${minDate}"
             class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
    </div>
    <div class="flex gap-3">
      <button onclick="window.app.hidePostponeModal()" class="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancel</button>
      <button onclick="window.app.confirmPostpone()" class="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600">Postpone</button>
    </div>`;
  document.getElementById('postponeGroupName').textContent = groupName;
}

function hidePostponeModal() {
  document.getElementById('postponeModal').classList.add('hidden');
  _pendingPostpone = null;
}

async function confirmPostpone() {
  if (!_pendingPostpone) return;
  const newDate = document.getElementById('postponeNewDate').value;
  if (!newDate) return;
  const { dateKey, groupId, groupName } = _pendingPostpone;
  try {
    await apiCleaning('postpone', { originalDate: dateKey, newDate, groupId, groupName });
    hidePostponeModal();
    await refreshData();
  } catch (e) { alert('Error postponing: ' + e.message); }
}

async function cancelPostponement(id) {
  try {
    await apiCleaning('cancelPostponement', { id });
    await refreshData();
  } catch (e) { alert('Error canceling postponement: ' + e.message); }
}

// ── Birthdays ──────────────────────────────────────────────────────────────────

async function setBirthday(personId, date) {
  try {
    await apiSetBirthday(personId, date);
    await refreshData();
  } catch (e) { alert('Error setting birthday: ' + e.message); }
}

// ── Vitalnya ───────────────────────────────────────────────────────────────────

async function addVitalnyaBooking() {
  const date = document.getElementById('vitalnyaDate').value;
  const timeStart = document.getElementById('vitalnyaTimeStart').value;
  const timeEnd = document.getElementById('vitalnyaTimeEnd').value;
  const name = document.getElementById('vitalnyaName').value.trim();
  const strict = document.getElementById('vitalnyaStrict').checked;
  if (!date || !timeStart || !timeEnd || !name) return;
  try {
    await apiAddVitalnyaBooking({ booking_date: date, time_start: timeStart, time_end: timeEnd, name, strict });
    ['vitalnyaDate','vitalnyaTimeStart','vitalnyaTimeEnd','vitalnyaName'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('vitalnyaStrict').checked = false;
    await refreshData();
  } catch (e) { alert('Error adding booking: ' + e.message); }
}

async function removeVitalnyaBooking(id) {
  try {
    await apiRemoveVitalnyaBooking(id);
    await refreshData();
  } catch (e) { alert('Error removing booking: ' + e.message); }
}

// ── Init ───────────────────────────────────────────────────────────────────────

window.addEventListener('auth:signedIn',      e => handleSignedIn(e.detail));
window.addEventListener('auth:expired',       () => { _activeUserId = null; showAuthScreen(); });
window.addEventListener('auth:passwordUpdated', () => {
  document.getElementById('newPasswordModal').classList.add('hidden');
  document.getElementById('newPasswordInput').value = '';
  // Show auth screen — clearSession was already called in submitNewPassword
  showAuthScreen();
  // Flash a success message in the auth error/info area
  document.getElementById('authInfo').textContent = 'Password updated! Please sign in.';
  document.getElementById('authInfo').classList.remove('hidden');
});

async function init() {
  const loading = document.getElementById('loadingScreen');

  // Handle Supabase email redirect (invite link, password recovery, email confirmation)
  const hashData = parseAuthHash();
  if (hashData?.access_token) {
    window.history.replaceState(null, '', window.location.pathname);
    if (hashData.type === 'recovery') {
      saveSession(hashData);
      loading.classList.add('hidden');
      showAuthScreen();
      document.getElementById('newPasswordModal').classList.remove('hidden');
      return;
    }
    saveSession(hashData); // invite / signup confirmation
  }

  const token = getAccessToken();
  loading.classList.add('hidden');

  if (!token) { showAuthScreen(); return; }

  // Refresh if expired
  if (isTokenExpired()) {
    const rt = getRefreshToken();
    if (!rt) { showAuthScreen(); return; }
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) throw new Error();
      saveSession(await res.json());
    } catch {
      clearSession();
      showAuthScreen();
      return;
    }
  }

  const user = decodeUserFromToken(getAccessToken());
  if (!user) { showAuthScreen(); return; }

  await handleSignedIn(user);
}

init();
