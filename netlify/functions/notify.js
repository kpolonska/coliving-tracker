import { createClient } from '@supabase/supabase-js';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  NOTIFICATION_HOUR_MORNING,
  NOTIFICATION_HOUR_EVENING,
} = process.env;

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

function formatUkrDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('uk-UA', {
    timeZone: 'UTC', day: 'numeric', month: 'long',
  });
}

function trimSeconds(timeStr) {
  return timeStr.split(':').slice(0, 2).join(':');
}

async function sendTelegram(botToken, chatId, text, replyMarkup = null) {
  if (!botToken || !chatId) return;
  const body = { chat_id: chatId, text, parse_mode: 'Markdown' };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function doneMarkup(dateStr) {
  return { inline_keyboard: [[{ text: '✅ Виніс(ла) сміття', callback_data: `td:${dateStr}` }]] };
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
    cursor = new Date(y, m - 1, d + 4).toLocaleDateString('sv', { timeZone: 'UTC' });
  }
  return null;
}

// Returns Kiev UTC offset in milliseconds (handles DST automatically)
function getKievOffsetMs(date) {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const kievStr = date.toLocaleString('en-US', { timeZone: 'Europe/Kiev' });
  return (new Date(kievStr) - new Date(utcStr));
}

async function processColiving(supabase, coliving, { today, hour, minute, morningHour, eveningHour, isFirstWindow }) {
  const { telegram_bot_token: botToken, telegram_chat_id: chatId, id: colivingId } = coliving;
  const send = (text, markup = null) => sendTelegram(botToken, chatId, text, markup);
  const sent = [];

  // ── Morning ───────────────────────────────────────────────────────────────
  if (hour === morningHour && isFirstWindow) {
    const [{ data: queue }, { data: alreadyDone }] = await Promise.all([
      supabase.from('trash_queue')
        .select('position, people!inner(name, coliving_id)')
        .eq('people.coliving_id', colivingId)
        .order('position').limit(1),
      supabase.from('trash_completions')
        .select('completed_date, people!inner(coliving_id)')
        .eq('people.coliving_id', colivingId)
        .eq('completed_date', today)
        .maybeSingle(),
    ]);

    if (queue?.[0] && !alreadyDone) {
      await send(`🗑️ Сьогодні черга виносити сміття: *${queue[0].people.name}*`, doneMarkup(today));
      sent.push('morning:trash');
    }

    const [{ data: settings }, { data: groups }, { data: postponements }] = await Promise.all([
      supabase.from('cleaning_settings').select('*').eq('coliving_id', colivingId).single(),
      supabase.from('cleaning_groups').select('*').eq('coliving_id', colivingId),
      supabase.from('cleaning_postponements').select('*').in(
        'group_id',
        (await supabase.from('cleaning_groups').select('id').eq('coliving_id', colivingId)).data?.map(g => g.id) || []
      ),
    ]);

    if (settings?.start_date && settings?.start_group_id) {
      const group = findCleaningGroupForDate(today, settings, groups || [], postponements || []);
      if (group) {
        await send(`🧹 Сьогодні черга прибирати: *${group.name}*`);
        sent.push('morning:cleaning');
      }
    }

    const { data: birthdays } = await supabase
      .from('birthdays')
      .select('birth_date, people!inner(name, coliving_id)')
      .eq('people.coliving_id', colivingId);
    const [, todayMonth, todayDay] = today.split('-').map(Number);
    for (const b of birthdays || []) {
      const [, bMonth, bDay] = b.birth_date.split('-').map(Number);
      if (bMonth === todayMonth && bDay === todayDay) {
        await send(`🎂 Сьогодні день народження у *${b.people.name}*! 🎉`);
        sent.push(`morning:birthday:${b.people.name}`);
      }
    }
  }

  // ── Evening ───────────────────────────────────────────────────────────────
  if (hour === eveningHour && isFirstWindow) {
    const [{ data: queue }, { data: done }] = await Promise.all([
      supabase.from('trash_queue')
        .select('position, people!inner(name, coliving_id)')
        .eq('people.coliving_id', colivingId)
        .order('position').limit(1),
      supabase.from('trash_completions')
        .select('completed_by, people!inner(name, coliving_id)')
        .eq('people.coliving_id', colivingId)
        .eq('completed_date', today)
        .maybeSingle(),
    ]);

    if (queue?.[0]) {
      if (done) {
        await send(`✅ *${done.people.name}* винісла сміття!`);
        sent.push('evening:done');
      } else {
        await send(`*${queue[0].people.name}*, не забудь винести сміття))`, doneMarkup(today));
        sent.push('evening:reminder');
      }
    }
  }

  // ── Vitalnya (every 15 min) ───────────────────────────────────────────────
  const now = Date.now();
  const { data: bookings } = await supabase
    .from('vitalnya_bookings')
    .select('*')
    .eq('coliving_id', colivingId)
    .gte('booking_date', today)
    .eq('reminder_sent', false);

  for (const b of bookings || []) {
    const [bY, bM, bD] = b.booking_date.split('-').map(Number);
    const [bH, bMin] = b.time_start.split(':').map(Number);
    const kievOffsetMs = getKievOffsetMs(new Date());
    const bookingUtcMs = Date.UTC(bY, bM - 1, bD, bH, bMin) - kievOffsetMs;
    const minutesUntil = (bookingUtcMs - now) / 60000;

    if (minutesUntil > 45 && minutesUntil <= 60) {
      const lines = [
        '⏰ Через годину бронювання витальні:',
        `*${b.name}* — ${formatUkrDate(b.booking_date)}, ${trimSeconds(b.time_start)} - ${trimSeconds(b.time_end)}`,
      ];
      if (b.strict) lines.push('🚫 Не турбувати');
      await send(lines.join('\n'));
      await supabase.from('vitalnya_bookings').update({ reminder_sent: true }).eq('id', b.id);
      sent.push(`vitalnya:${b.id}`);
    }
  }

  return sent;
}

export const handler = async () => {
  const today = kievDate();
  const hour = kievHour();
  const minute = kievMinute();
  const morningHour = parseInt(NOTIFICATION_HOUR_MORNING || '6', 10);
  const eveningHour = parseInt(NOTIFICATION_HOUR_EVENING || '21', 10);
  const isFirstWindow = minute < 15;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: colivings } = await supabase
    .from('colivings')
    .select('id, telegram_bot_token, telegram_chat_id')
    .not('telegram_bot_token', 'is', null)
    .not('telegram_chat_id', 'is', null);

  const ctx = { today, hour, minute, morningHour, eveningHour, isFirstWindow };
  const allSent = [];

  for (const coliving of colivings || []) {
    const sent = await processColiving(supabase, coliving, ctx);
    allSent.push(...sent.map(s => `c${coliving.id}:${s}`));
  }

  return { statusCode: 200, body: `Sent: ${allSent.join(', ') || 'nothing'}` };
};
