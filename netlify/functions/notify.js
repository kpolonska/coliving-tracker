import { createClient } from '@supabase/supabase-js';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  NOTIFICATION_HOUR_MORNING,
  NOTIFICATION_HOUR_EVENING,
} = process.env;

// Using toLocaleString with timeZone handles DST automatically — no fixed UTC offset.
function kievDate() {
  return new Date().toLocaleDateString('sv', { timeZone: 'Europe/Kiev' });
}

function kievHour() {
  return parseInt(
    new Date().toLocaleString('en-US', { timeZone: 'Europe/Kiev', hour: 'numeric', hour12: false }),
    10
  );
}

function kievMinute() {
  return parseInt(
    new Date().toLocaleString('en-US', { timeZone: 'Europe/Kiev', minute: '2-digit' }),
    10
  );
}

async function sendTelegram(text, replyMarkup = null) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const body = { chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function doneMarkup(dateStr) {
  return {
    inline_keyboard: [[
      { text: '✅ Виніс(ла) сміття', callback_data: `td:${dateStr}` },
    ]],
  };
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
  const today = kievDate();
  const hour = kievHour();
  const minute = kievMinute();
  const morningHour = parseInt(NOTIFICATION_HOUR_MORNING || '6', 10);
  const eveningHour = parseInt(NOTIFICATION_HOUR_EVENING || '21', 10);

  // Timed notifications are only sent in the first 15-min window of the target hour,
  // matching the cron's :00 firing. Subsequent :15/:30/:45 firings are skipped for these.
  const isFirstWindow = minute < 15;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const sent = [];

  // ── Morning notifications ─────────────────────────────────────────────────
  if (hour === morningHour && isFirstWindow) {
    const [{ data: queue }, { data: alreadyDone }] = await Promise.all([
      supabase.from('trash_queue').select('position, people(name)').order('position').limit(1),
      supabase.from('trash_completions').select('completed_date').eq('completed_date', today).maybeSingle(),
    ]);

    if (queue?.[0] && !alreadyDone) {
      await sendTelegram(
        `🗑 Сьогодні черга виносити сміття: <b>${queue[0].people.name}</b>`,
        doneMarkup(today)
      );
      sent.push('morning:trash');
    }

    const [{ data: settings }, { data: groups }, { data: postponements }] = await Promise.all([
      supabase.from('cleaning_settings').select('*').eq('id', 1).single(),
      supabase.from('cleaning_groups').select('*'),
      supabase.from('cleaning_postponements').select('*'),
    ]);

    if (settings?.start_date && settings?.start_group_id) {
      const group = findCleaningGroupForDate(today, settings, groups || [], postponements || []);
      if (group) {
        await sendTelegram(`🧹 Сьогодні черга прибирати: <b>${group.name}</b>`);
        sent.push('morning:cleaning');
      }
    }

    const { data: birthdays } = await supabase.from('birthdays').select('birth_date, people(name)');
    const [, todayMonth, todayDay] = today.split('-').map(Number);
    for (const b of birthdays || []) {
      const [, bMonth, bDay] = b.birth_date.split('-').map(Number);
      if (bMonth === todayMonth && bDay === todayDay) {
        await sendTelegram(`🎂 Сьогодні день народження у <b>${b.people.name}</b>! 🎉`);
        sent.push(`morning:birthday:${b.people.name}`);
      }
    }
  }

  // ── Evening notification — trash only, skipped if already done ────────────
  if (hour === eveningHour && isFirstWindow) {
    const [{ data: queue }, { data: done }] = await Promise.all([
      supabase.from('trash_queue').select('position, people(name)').order('position').limit(1),
      supabase.from('trash_completions').select('completed_date').eq('completed_date', today).maybeSingle(),
    ]);

    if (queue?.[0] && !done) {
      await sendTelegram(
        `⏰ Нагадування: <b>${queue[0].people.name}</b>, не забудь винести сміття!`,
        doneMarkup(today)
      );
      sent.push('evening:trash');
    }
  }

  // ── Vitalnya — every 15 min, alert for bookings starting in 45–75 min ─────
  const nowMinutes = hour * 60 + minute;
  const { data: bookings } = await supabase
    .from('vitalnya_bookings')
    .select('*')
    .eq('booking_date', today);

  for (const b of bookings || []) {
    const [bH, bM] = b.time_start.split(':').map(Number);
    const bookingMinutes = bH * 60 + bM;
    if (bookingMinutes >= nowMinutes + 45 && bookingMinutes < nowMinutes + 75) {
      const strictNote = b.strict ? ' 🚫 <b>Заходити заборонено!</b>' : '';
      await sendTelegram(
        `🔒 <b>${b.name}</b> бронює кімнату о ${b.time_start}–${b.time_end}${strictNote}`
      );
      sent.push(`vitalnya:${b.id}`);
    }
  }

  return { statusCode: 200, body: `Sent: ${sent.join(', ') || 'nothing'}` };
};
