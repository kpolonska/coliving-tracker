import { state } from '../state.js';
import { escapeHtml } from '../utils.js';

export function renderPeople() {
  if (!state.people.length) {
    return `
      <div class="text-center py-12 text-gray-400">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
        </svg>
        <p class="text-sm mb-3">No members yet.</p>
        <button onclick="window.app.openSettings()"
                class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-600 text-sm font-medium rounded-lg hover:bg-indigo-100 transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Invite people
        </button>
      </div>`;
  }

  return `
    <div class="space-y-2">
      ${state.people.map(person => `
        <div class="flex items-center gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-100">
          <div class="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            ${escapeHtml(person.name.slice(0, 2).toUpperCase())}
          </div>
          <span class="font-medium text-gray-800">${escapeHtml(person.name)}</span>
          ${person.id === state.linkedPersonId ? '<span class="ml-auto text-xs text-indigo-500 font-medium">you</span>' : ''}
        </div>
      `).join('')}
    </div>`;
}
