import { state } from './state.js';
import {
  initSupabase, getSupabase,
  setAuthMode, handleAuthSubmit, sendPasswordReset, submitNewPassword,
} from './auth.js';
import {
  fetchConfig, loadAllData,
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

// All functions referenced by inline onclick handlers must be on window.app.
window.app = {
  setAuthMode,
  handleAuthSubmit,
  sendPasswordReset,
  submitNewPassword,
  signOut,
  switchTab,
  addPerson,
  removePerson,
  markTrashDone,
  unmarkTrashDone,
  addToTrashQueue,
  removeFromTrashQueue,
  insertIntoTrashQueue,
  toggleInsertMenu,
  createCleaningGroup,
  removeCleaningGroup,
  saveCleaningSettings,
  changeMonth,
  showPostponeModal,
  hidePostponeModal,
  confirmPostpone,
  cancelPostponement,
  setBirthday,
  addVitalnyaBooking,
  removeVitalnyaBooking,
};

// ── Auth screens ───────────────────────────────────────────────────────────────

function showAuthScreen() {
  document.getElementById('appScreen').classList.add('hidden');
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('authPassword').value = '';
}

async function showAppScreen(user) {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  document.getElementById('userEmail').textContent = user?.email || '';
  await refreshData();
}

export async function signOut() {
  await getSupabase().auth.signOut();
  showAuthScreen();
}

// ── Data ───────────────────────────────────────────────────────────────────────

async function refreshData() {
  try {
    const { people, trashData, cleaningData, birthdays, vitalnya } = await loadAllData();
    state.people = people;
    state.trashQueue = trashData.queue;
    state.trashCompletion = trashData.completion;

    // Completion from a previous day should not block today's banner.
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
    </div>
  `;
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

async function init() {
  const loading = document.getElementById('loadingScreen');

  let config;
  try {
    config = await fetchConfig();
  } catch {
    loading.innerHTML = '<p class="text-red-500 text-center p-8">Could not reach server. Check Netlify environment variables.</p>';
    return;
  }

  const supabase = initSupabase(config.supabaseUrl, config.supabaseAnonKey);

  window.addEventListener('auth:passwordUpdated', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await showAppScreen(user);
  });

  let _activeUserId = null;

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      document.getElementById('newPasswordModal').classList.remove('hidden');
    } else if (event === 'SIGNED_IN' && session) {
      if (_activeUserId !== session.user.id) {
        _activeUserId = session.user.id;
        await showAppScreen(session.user);
      }
    } else if (event === 'SIGNED_OUT') {
      _activeUserId = null;
      showAuthScreen();
    }
  });

  const { data: { session } } = await supabase.auth.getSession();
  loading.classList.add('hidden');

  if (session) {
    _activeUserId = session.user.id;
    await showAppScreen(session.user);
  } else {
    showAuthScreen();
  }
}

init();
