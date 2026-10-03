import { state } from '../state.js';
import { escapeHtml } from '../utils.js';

export function renderPeople() {
  return `
    <div class="mb-6">
      <div class="flex gap-2">
        <input type="text" id="newPersonName" placeholder="Enter person's name"
               onkeypress="if(event.key==='Enter')window.app.addPerson()"
               class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
        <button onclick="window.app.addPerson()" class="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
          Add
        </button>
      </div>
    </div>
    ${state.people.length === 0 ? `
      <div class="text-center py-12 text-gray-400">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
        <p>No people added yet. Add your first housemate!</p>
      </div>
    ` : `
      <div class="space-y-2">
        ${state.people.map(person => `
          <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100">
            <span class="font-medium text-gray-800">${escapeHtml(person.name)}</span>
            <button onclick="window.app.removePerson(${person.id})" class="text-red-500 hover:text-red-700">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        `).join('')}
      </div>
    `}
  `;
}
