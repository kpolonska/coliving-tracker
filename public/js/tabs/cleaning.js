import { state } from '../state.js';
import { escapeHtml, toLocalDateKey, formatDate, getDisplayInfoForDate } from '../utils.js';

export function renderCleaning() {
  const { start_date, start_group_id } = state.cleaningSettings;
  const hasSchedule = start_date && start_group_id;

  return `
    ${state.cleaningGroups.length > 0 ? `
      <div class="mb-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-lg text-gray-800">Cleaning Schedule</h3>
          <button onclick="document.getElementById('scheduleSetup').classList.toggle('hidden')"
                  class="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            ${hasSchedule ? 'Change Schedule' : 'Set Schedule'}
          </button>
        </div>

        <div id="scheduleSetup" class="mb-4 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg ${hasSchedule ? 'hidden' : ''}">
          <h4 class="font-bold text-gray-800 mb-3">Set Starting Point</h4>
          <div class="space-y-3">
            <div>
              <label class="block text-sm text-gray-600 mb-1">First cleaning date:</label>
              <input type="date" id="cleaningStartDate" value="${start_date || ''}"
                     class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
            <div>
              <label class="block text-sm text-gray-600 mb-1">First group to clean:</label>
              <select id="cleaningStartGroup" class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Select a group</option>
                ${state.cleaningGroups.map(g => `<option value="${g.id}" ${g.id === start_group_id ? 'selected' : ''}>${escapeHtml(g.name)}</option>`).join('')}
              </select>
            </div>
            <button onclick="window.app.saveCleaningSettings()" class="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              Save Schedule
            </button>
          </div>
        </div>

        ${hasSchedule ? renderCalendar() : `
          <div class="text-center py-8 bg-gray-50 rounded-lg text-gray-500">
            <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            <p>Set a starting date and group to view the schedule</p>
          </div>
        `}

        ${state.cleaningPostponements.length > 0 ? `
          <div class="mt-4 p-4 bg-orange-50 border-2 border-orange-200 rounded-lg">
            <h4 class="font-bold text-gray-800 mb-3">Active Postponements</h4>
            <div class="space-y-2">
              ${state.cleaningPostponements.map(p => `
                <div class="flex items-center justify-between p-3 bg-white rounded-lg">
                  <div class="flex items-center gap-2 text-sm">
                    <span class="text-gray-600">${escapeHtml(p.group_name)}:</span>
                    <span class="line-through text-gray-400">${formatDate(p.original_date)}</span>
                    <svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                    <span class="font-medium text-green-700">${formatDate(p.new_date)}</span>
                  </div>
                  <button onclick="window.app.cancelPostponement(${p.id})" class="text-red-500 hover:text-red-700 text-sm">Cancel</button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    ` : ''}

    <h3 class="font-bold text-lg mb-3 text-gray-800">Create Cleaning Group</h3>
    <div class="mb-6 p-4 bg-gray-50 rounded-lg">
      <input type="text" id="newGroupName" placeholder="Group name (e.g., Team A)"
             class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3">
      <p class="text-sm text-gray-600 mb-2">Select people for this group:</p>
      <div class="space-y-2 mb-4">
        ${state.people.map(p => `
          <label class="flex items-center gap-3 p-2 hover:bg-gray-100 rounded cursor-pointer">
            <input type="checkbox" value="${p.id}" class="group-member-checkbox w-4 h-4">
            <span class="text-gray-800">${escapeHtml(p.name)}</span>
          </label>
        `).join('')}
      </div>
      <button onclick="window.app.createCleaningGroup()" class="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
        Create Group
      </button>
    </div>

    <h3 class="font-bold text-lg mb-3 text-gray-800">Cleaning Groups</h3>
    ${state.cleaningGroups.length === 0 ? `
      <div class="text-center py-8 text-gray-400">
        <p>No cleaning groups yet. Create your first group!</p>
      </div>
    ` : `
      <div class="space-y-3">
        ${state.cleaningGroups.map(group => `
          <div class="p-4 bg-gray-50 rounded-lg">
            <div class="flex items-start justify-between">
              <div>
                <h4 class="font-bold text-gray-800">${escapeHtml(group.name)}</h4>
                <p class="text-sm text-gray-600">${group.members.map(id => {
                  const p = state.people.find(p => p.id === id);
                  return p ? escapeHtml(p.name) : 'Unknown';
                }).join(', ')}</p>
              </div>
              <button onclick="window.app.removeCleaningGroup(${group.id})" class="text-red-500 hover:text-red-700">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;
}

function renderCalendar() {
  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = toLocalDateKey(new Date());

  let days = '';
  for (let i = 0; i < firstDay; i++) days += '<div class="p-1 min-h-20"></div>';

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const isToday = toLocalDateKey(date) === todayStr;
    const info = getDisplayInfoForDate(date);

    let bg = isToday ? 'bg-blue-100' : '';
    let border = 'border-gray-200';
    let content = '';
    let clickable = '';

    if (info?.type === 'scheduled') {
      bg = isToday ? 'bg-blue-100' : 'bg-purple-50';
      content = `<div class="text-xs mt-1 font-medium text-purple-700 truncate">${escapeHtml(info.group.name)}</div>`;
      clickable = `onclick="window.app.showPostponeModal('${info.dateKey}', ${info.group.id})" class="cursor-pointer hover:bg-purple-100"`;
    } else if (info?.type === 'postponed-from') {
      bg = isToday ? 'bg-blue-100' : 'bg-orange-50';
      border = 'border-orange-300';
      content = `
        <div class="text-xs mt-1">
          <span class="line-through text-orange-600 block truncate">${escapeHtml(info.originalGroup?.name || '')}</span>
          <span class="text-orange-500 flex items-center gap-0.5">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
            ${formatDate(info.newDate).split(',')[0]}
          </span>
        </div>`;
    } else if (info?.type === 'postponed-to') {
      bg = isToday ? 'bg-blue-100' : 'bg-green-50';
      border = 'border-green-400';
      content = `
        <div class="text-xs mt-1">
          <span class="font-medium text-green-700 block truncate">${escapeHtml(info.group.name)}</span>
          <span class="text-green-600">(moved)</span>
        </div>`;
    }

    days += `
      <div class="p-1 min-h-20 border rounded ${bg} ${border}" ${clickable}>
        <div class="text-sm font-medium ${isToday ? 'text-blue-700' : 'text-gray-700'}">${day}</div>
        ${content}
      </div>`;
  }

  return `
    <div class="bg-white border-2 border-gray-200 rounded-lg p-4">
      <div class="flex items-center justify-between mb-4">
        <button onclick="window.app.changeMonth(-1)" class="p-2 hover:bg-gray-100 rounded">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
        </button>
        <h4 class="font-bold text-lg">${state.currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h4>
        <button onclick="window.app.changeMonth(1)" class="p-2 hover:bg-gray-100 rounded">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
        </button>
      </div>
      <p class="text-xs text-gray-500 mb-3 text-center">Click on a scheduled cleaning to postpone it</p>
      <div class="grid grid-cols-7 gap-1">
        ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="text-center font-bold text-sm text-gray-600 p-2">${d}</div>`).join('')}
        ${days}
      </div>
    </div>

    <div id="postponeModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 hidden">
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="font-bold text-lg mb-4 text-gray-800">Postpone Cleaning</h3>
        <div id="postponeModalContent"></div>
      </div>
    </div>
  `;
}
