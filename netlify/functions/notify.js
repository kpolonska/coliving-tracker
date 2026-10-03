import { createClient } from '@supabase/supabase-js';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  NOTIFICATION_HOUR,
} = process.env;

// Returns the current hour (0-23) in Europe/Kiev local time.
// Using toLocaleString with timeZone handles DST automatically — no fixed UTC offset.
function kievHour() {
  return parseInt(
    new Date().toLocaleString('en-US', { timeZone: 'Europe/Kiev', hour: 'numeric', hour12: false }),
    10
  );
}

function todayKiev() {
  return new Date().toLocaleDateString('sv', { timeZone: 'Europe/Kiev' });
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
  });
}

function findCleaningGroupForDate(todayStr, settings, groups, postponements) {
  const { start_date, start_group_id } = settings;
  const startIdx = groups.findIndex(g => g.id === start_group_id);
  if (startIdx === -1) return null;

  const order = [...groups.slice(startIdx), ...groups.slice(0, startIdx)];
  let cursor = start_date;

  for (let slot = 0; slot < 500; slot++) {
    const group = order[slot % order.length];
    const postponement = postponements.find(
      p => p.group_id === group.id && p.original_date === cursor
    );
    const actual = postponement ? postponement.new_date : cursor;

    if (actual === todayStr) return group;
    if (actual > todayStr && cursor > todayStr) break;

    const [y, m, d] = actual.split('-').map(Number);
    const next = new Date(y, m - 1, d + 4);
    cursor = next.toLocaleDateString('sv', { timeZone: 'UTC' });
  }
  return null;
}

export const handler = async () => {
  const targetHour = parseInt(NOTIFICATION_HOUR || '9', 10);

  if (kievHour() !== targetHour) {
    return { statusCode: 200, body: 'Not notification time' };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const today = todayKiev();
  const messages = [];

  // ── Trash reminder ────────────────────────────────────────────────────────
  const [{ data: queue }, { data: alreadyDone }] = await Promise.all([
    supabase.from('trash_queue').select('position, people(name)').order('position').limit(1),
    supabase.from('trash_completions').select('completed_date').eq('completed_date', today).maybeSingle(),
  ]);

  if (queue?.[0] && !alreadyDone) {
    messages.push(`🗑 <b>Trash reminder</b>\nIt's <b>${queue[0].people.name}</b>'s turn to take out the trash today!`);
  }

  // ── Cleaning reminder ─────────────────────────────────────────────────────
  const [{ data: settings }, { data: groups }, { data: postponements }] = await Promise.all([
    supabase.from('cleaning_settings').select('*').eq('id', 1).single(),
    supabase.from('cleaning_groups').select('*'),
    supabase.from('cleaning_postponements').select('*'),
  ]);

  if (settings?.start_date && settings?.start_group_id) {
    const group = findCleaningGroupForDate(today, settings, groups || [], postponements || []);
    if (group) {
      messages.push(`🧹 <b>Cleaning day!</b>\nIt's <b>${group.name}</b>'s turn to clean today!`);
    }
  }

  // ── Birthday reminders ────────────────────────────────────────────────────
  const { data: birthdays } = await supabase.from('birthdays').select('birth_date, people(name)');
  const [, todayMonth, todayDay] = today.split('-').map(Number);

  for (const b of birthdays || []) {
    const [, bMonth, bDay] = b.birth_date.split('-').map(Number);
    if (bMonth === todayMonth && bDay === todayDay) {
      messages.push(`🎂 <b>Birthday today!</b>\nHappy birthday to <b>${b.people.name}</b>! 🎉`);
    }
  }

  for (const msg of messages) {
    await sendTelegram(msg);
  }

  return { statusCode: 200, body: `Sent ${messages.length} notification(s)` };
};
