import { state } from '../state.js';
import { escapeHtml, formatDate, todayLocalDateKey } from '../utils.js';

export function renderVitalnya() {
  const today = todayLocalDateKey();
  const upcoming = [...state.vitalnyaBookings]
    .filter(b => b.booking_date >= today)
    .sort((a, b) => (a.booking_date + a.time_start).localeCompare(b.booking_date + b.time_start));

  return `
    <h3 class="font-bold text-lg mb-4 text-gray-800">Book Vitalnya Room</h3>
    <div class="mb-6 p-4 bg-gray-50 rounded-lg">
      <div class="space-y-3">
        <div>
          <label class="block text-sm text-gray-600 mb-1">Date:</label>
          <input type="date" id="vitalnyaDate" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm text-gray-600 mb-1">Start Time:</label>
            <input type="time" id="vitalnyaTimeStart" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>
          <div>
            <label class="block text-sm text-gray-600 mb-1">End Time:</label>
            <input type="time" id="vitalnyaTimeEnd" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>
        </div>
        <div>
          <label class="block text-sm text-gray-600 mb-1">Your Name:</label>
          <input type="text" id="vitalnyaName" placeholder="Enter your name" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
        </div>
        <div>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" id="vitalnyaStrict" class="w-4 h-4">
            <span class="text-sm text-gray-700">Strictly no entry (do not disturb)</span>
          </label>
        </div>
        <button onclick="window.app.addVitalnyaBooking()" class="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          Book Room
        </button>
      </div>
    </div>

    <h3 class="font-bold text-lg mb-3 text-gray-800">Upcoming Bookings</h3>
    ${upcoming.length === 0 ? `
      <div class="text-center py-8 text-gray-400">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"></path></svg>
        <p>No bookings yet</p>
      </div>
    ` : `
      <div class="space-y-3">
        ${upcoming.map(b => `
          <div class="p-4 rounded-lg border-2 ${b.strict ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}">
            <div class="flex items-start justify-between">
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <p class="font-bold text-lg text-gray-800">${escapeHtml(b.name)}</p>
                  ${b.strict ? '<span class="px-2 py-0.5 bg-red-200 text-red-800 text-xs rounded-full font-medium">Do Not Disturb</span>' : ''}
                </div>
                <p class="text-sm text-gray-600">${formatDate(b.booking_date)}</p>
                <p class="text-sm font-medium text-gray-700 mt-1">${b.time_start} – ${b.time_end}</p>
              </div>
              <button onclick="window.app.removeVitalnyaBooking(${b.id})" class="text-red-500 hover:text-red-700">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;
}
