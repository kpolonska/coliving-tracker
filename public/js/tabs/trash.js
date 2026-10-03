import { state } from '../state.js';
import { todayLocalDateKey, getPersonName, escapeHtml } from '../utils.js';

function isCompletedToday() {
  return state.trashCompletion?.completed_date === todayLocalDateKey();
}

function renderInsertButton(position) {
  if (state.people.length === 0) return '';
  return `
    <div class="insert-btn-container py-1">
      <button onclick="window.app.toggleInsertMenu(${position})" class="w-full flex items-center justify-center gap-1 py-1 text-xs text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
        <div class="flex-1 h-px bg-gray-200"></div>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
        <span>Insert</span>
        <div class="flex-1 h-px bg-gray-200"></div>
      </button>
      <div id="insert-menu-${position}" class="hidden bg-indigo-50 border-2 border-indigo-200 rounded-lg p-2 mt-1">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-medium text-indigo-700">Select person:</span>
          <button onclick="window.app.toggleInsertMenu(${position})" class="text-gray-400 hover:text-gray-600 text-xs">Cancel</button>
        </div>
        <div class="flex flex-wrap gap-1">
          ${state.people.map(p => `
            <button onclick="window.app.insertIntoTrashQueue(${p.id}, ${position})"
                    class="px-2 py-1 bg-white text-indigo-700 rounded text-sm hover:bg-indigo-600 hover:text-white border border-indigo-200">
              ${escapeHtml(p.name)}
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

export function renderTrash() {
  const completed = isCompletedToday();
  const currentPerson = completed
    ? getPersonName(state.trashCompletion.completed_by)
    : (state.trashQueue[0] ? getPersonName(state.trashQueue[0].person_id) : null);

  return `
    <div class="mb-6 p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-200">
      ${currentPerson ? `
        <div class="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 class="font-bold text-sm text-gray-600 mb-1">Today's Turn:</h3>
            <p class="text-3xl font-bold text-green-700">${escapeHtml(currentPerson)}</p>
          </div>
          ${completed ? `
            <button onclick="window.app.unmarkTrashDone()" class="px-6 py-3 bg-green-100 text-green-800 rounded-lg font-medium hover:bg-green-200 transition-colors">
              ✓ Completed (click to undo)
            </button>
          ` : `
            <button onclick="window.app.markTrashDone()" class="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
              Mark as Done
            </button>
          `}
        </div>
      ` : `
        <p class="text-gray-500">No one in queue yet. Add people to the queue below.</p>
      `}
    </div>

    <div class="grid md:grid-cols-2 gap-6">
      <div>
        <h3 class="font-bold text-lg mb-3 text-gray-800">Queue Order</h3>
        ${state.trashQueue.length === 0 ? `
          <div class="text-center py-8 bg-gray-50 rounded-lg text-gray-400">
            <svg class="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            <p>Queue is empty</p>
          </div>
        ` : `
          <div class="space-y-1">
            ${renderInsertButton(0)}
            ${state.trashQueue.map((item, index) => `
              <div class="flex items-center gap-3 p-3 rounded-lg ${index === 0 ? 'bg-green-100 border-2 border-green-300' : 'bg-gray-50'}">
                <span class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${index === 0 ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'}">
                  ${index + 1}
                </span>
                <span class="flex-1 font-medium ${index === 0 ? 'text-green-800' : 'text-gray-700'}">
                  ${escapeHtml(getPersonName(item.person_id))}
                </span>
                <button onclick="window.app.removeFromTrashQueue(${item.id})" class="text-red-400 hover:text-red-600 p-1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
              </div>
              ${renderInsertButton(index + 1)}
            `).join('')}
          </div>
        `}
      </div>

      <div>
        <h3 class="font-bold text-lg mb-3 text-gray-800">Add to End of Queue</h3>
        ${state.people.length === 0 ? `
          <div class="text-center py-8 bg-gray-50 rounded-lg text-gray-400">
            <p>Add people in the People tab first</p>
          </div>
        ` : `
          <div class="space-y-2">
            ${state.people.map(person => {
              const count = state.trashQueue.filter(t => t.person_id === person.id).length;
              return `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-gray-800">${escapeHtml(person.name)}</span>
                    ${count > 0 ? `<span class="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">×${count} in queue</span>` : ''}
                  </div>
                  <button onclick="window.app.addToTrashQueue(${person.id})" class="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm flex items-center gap-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    Add
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}
