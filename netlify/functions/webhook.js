// Handles Telegram callback_query taps for the trash "done / undo" inline buttons.
// Ported from the original Supabase Edge Function.
import { createClient } from '@supabase/supabase-js';

const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_WEBHOOK_SECRET,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

function kievDate() {
  return new Date().toLocaleDateString('sv', { timeZone: 'Europe/Kiev' });
}

function doneMarkup(dateStr) {
  return { inline_keyboard: [[{ text: '✅ Виніс(ла) сміття', callback_data: `td:${dateStr}` }]] };
}
function undoMarkup(dateStr) {
  return { inline_keyboard: [[{ text: '↩️ Скасувати', callback_data: `tu:${dateStr}` }]] };
}

async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) console.error('Telegram error', method, json);
  return json;
}

async function getPersonName(supabase, id) {
  const { data } = await supabase.from('people').select('name').eq('id', id).single();
  return data?.name ?? 'Хтось';
}

async function handleTrashDone(supabase, cb, requestedDate) {
  const today = kievDate();

  if (requestedDate !== today) {
    return tg('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: 'Ця кнопка вже неактуальна',
      show_alert: true,
    });
  }

  const { data: existing } = await supabase
    .from('trash_completions')
    .select('completed_by')
    .eq('completed_date', today)
    .maybeSingle();

  if (existing) {
    const name = await getPersonName(supabase, existing.completed_by);
    await tg('editMessageText', {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      text: `✅ <b>${name}</b> виніс(ла) сміття!`,
      parse_mode: 'HTML',
      reply_markup: undoMarkup(today),
    });
    return tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Вже позначено' });
  }

  const { data: queue } = await supabase
    .from('trash_queue').select('id,person_id').order('position');

  if (!queue?.length) {
    return tg('answerCallbackQuery', {
      callback_query_id: cb.id, text: 'Черга порожня', show_alert: true,
    });
  }

  const currentPersonId = queue[0].person_id;
  await supabase.from('trash_completions')
    .insert({ completed_date: today, completed_by: currentPersonId });

  if (queue.length > 1) {
    const newQueue = [...queue.slice(1), queue[0]];
    for (let i = 0; i < newQueue.length; i++) {
      await supabase.from('trash_queue').update({ position: i }).eq('id', newQueue[i].id);
    }
  }

  const name = await getPersonName(supabase, currentPersonId);
  await tg('editMessageText', {
    chat_id: cb.message.chat.id,
    message_id: cb.message.message_id,
    text: `✅ <b>${name}</b> виніс(ла) сміття!`,
    parse_mode: 'HTML',
    reply_markup: undoMarkup(today),
  });
  return tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Готово!' });
}

async function handleTrashUndo(supabase, cb, requestedDate) {
  const today = kievDate();

  if (requestedDate !== today) {
    return tg('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: 'Ця кнопка вже неактуальна',
      show_alert: true,
    });
  }

  const { data: existing } = await supabase
    .from('trash_completions')
    .select('completed_by')
    .eq('completed_date', today)
    .maybeSingle();

  if (!existing) {
    const { data: queue } = await supabase
      .from('trash_queue').select('person_id').order('position').limit(1);
    const name = queue?.length ? await getPersonName(supabase, queue[0].person_id) : 'нікого';
    await tg('editMessageText', {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      text: `🗑 Сьогодні черга виносити сміття: <b>${name}</b>`,
      parse_mode: 'HTML',
      reply_markup: doneMarkup(today),
    });
    return tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Немає що скасовувати' });
  }

  const completedById = existing.completed_by;
  const { data: queue } = await supabase
    .from('trash_queue').select('id,person_id').order('position');

  if (queue && queue.length > 1) {
    const idx = queue.findIndex(q => q.person_id === completedById);
    if (idx > 0) {
      const reordered = [...queue];
      const [person] = reordered.splice(idx, 1);
      reordered.unshift(person);
      for (let i = 0; i < reordered.length; i++) {
        await supabase.from('trash_queue').update({ position: i }).eq('id', reordered[i].id);
      }
    }
  }

  await supabase.from('trash_completions').delete().eq('completed_date', today);

  const name = await getPersonName(supabase, completedById);
  await tg('editMessageText', {
    chat_id: cb.message.chat.id,
    message_id: cb.message.message_id,
    text: `🗑 Сьогодні черга виносити сміття: <b>${name}</b>`,
    parse_mode: 'HTML',
    reply_markup: doneMarkup(today),
  });
  return tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Скасовано' });
}

export const handler = async (event) => {
  if (event.headers['x-telegram-bot-api-secret-token'] !== TELEGRAM_WEBHOOK_SECRET) {
    return { statusCode: 401, body: 'unauthorized' };
  }

  let update;
  try {
    update = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'bad request' };
  }

  const cb = update.callback_query;
  if (!cb || typeof cb.data !== 'string') {
    return { statusCode: 200, body: 'ok' };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    if (cb.data.startsWith('td:')) {
      await handleTrashDone(supabase, cb, cb.data.slice(3));
    } else if (cb.data.startsWith('tu:')) {
      await handleTrashUndo(supabase, cb, cb.data.slice(3));
    } else {
      await tg('answerCallbackQuery', { callback_query_id: cb.id });
    }
  } catch (err) {
    console.error('webhook handler error', err);
    await tg('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: 'Помилка, спробуй ще раз',
      show_alert: true,
    });
  }

  return { statusCode: 200, body: 'ok' };
};
