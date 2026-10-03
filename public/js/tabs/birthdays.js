import { state } from '../state.js';
import { escapeHtml, formatDate, getUpcomingBirthdays } from '../utils.js';

export function renderBirthdays() {
  const upcoming = getUpcomingBirthdays();

  return `
    <div class="mb-6">
      <h3 class="font-bold text-lg mb-4 text-gray-800">Upcoming Birthdays</h3>
      ${upcoming.length > 0 ? `
        <div class="space-y-3">
          ${upcoming.map(b => `
            <div class="p-4 bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg border-2 border-pink-200">
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-bold text-lg text-gray-800">${escapeHtml(b.name)}</p>
                  <p class="text-sm text-gray-600">${formatDate(b.birth_date)}</p>
                </div>
                <div class="text-right">
                  <p class="text-2xl font-bold text-pink-600">${b.daysUntil}</p>
                  <p class="text-xs text-gray-600">days</p>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="text-center py-8 text-gray-400">
          <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"></path></svg>
          <p>No upcoming birthdays in the next 30 days</p>
        </div>
      `}
    </div>

    <h3 class="font-bold text-lg mb-3 text-gray-800">Set Birthdays</h3>
    ${state.people.length === 0 ? `
      <div class="text-center py-8 text-gray-400">
        <p>Add people first to set their birthdays</p>
      </div>
    ` : `
      <div class="space-y-3">
        ${state.people.map(person => {
          const bday = state.birthdays.find(b => b.person_id === person.id);
          return `
            <div class="p-4 bg-gray-50 rounded-lg">
              <div class="flex items-center justify-between gap-4">
                <span class="font-medium text-gray-800">${escapeHtml(person.name)}</span>
                <input type="date" value="${bday?.birth_date || ''}"
                       onchange="window.app.setBirthday(${person.id}, this.value)"
                       class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;
}
