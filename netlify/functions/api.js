import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

function ok(body) {
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function created(body) {
  return { statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function err(statusCode, message) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: message }) };
}

async function authedClient(event) {
  const auth = event.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return supabase;
}

export const handler = async (event) => {
  const path = event.path.replace(/^\/api/, '') || '/';
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};

  // Public — returns only the two publishable values (no secrets)
  if (method === 'GET' && path === '/config') {
    return ok({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY });
  }

  const supabase = await authedClient(event);
  if (!supabase) return err(401, 'Unauthorized');

  // ── PEOPLE ────────────────────────────────────────────────────────────────
  if (path === '/people') {
    if (method === 'GET') {
      const { data, error } = await supabase.from('people').select('*').order('id');
      if (error) return err(500, error.message);
      return ok(data);
    }
    if (method === 'POST') {
      const { data, error } = await supabase.from('people').insert({ name: body.name }).select().single();
      if (error) return err(500, error.message);
      return created(data);
    }
    if (method === 'DELETE') {
      const { id } = body;
      await Promise.all([
        supabase.from('trash_completions').delete().eq('completed_by', id),
        supabase.from('trash_queue').delete().eq('person_id', id),
        supabase.from('birthdays').delete().eq('person_id', id),
        supabase.from('cleaning_group_members').delete().eq('person_id', id),
      ]);
      const { error } = await supabase.from('people').delete().eq('id', id);
      if (error) return err(500, error.message);
      return ok({ ok: true });
    }
  }

  // ── TRASH ─────────────────────────────────────────────────────────────────
  if (path === '/trash') {
    if (method === 'GET') {
      const [queueRes, completionRes] = await Promise.all([
        supabase.from('trash_queue').select('*').order('position'),
        supabase.from('trash_completions').select('*').order('completed_date', { ascending: false }).limit(1),
      ]);
      return ok({ queue: queueRes.data || [], completion: completionRes.data?.[0] || null });
    }

    if (method === 'POST') {
      const { action } = body;

      if (action === 'markDone') {
        const { today, currentPersonId, queue } = body;
        const { data: existing } = await supabase
          .from('trash_completions').select('id').eq('completed_date', today).maybeSingle();
        const { error } = await supabase.from('trash_completions').upsert(
          { completed_date: today, completed_by: currentPersonId },
          { onConflict: 'completed_date' }
        );
        if (error) return err(500, error.message);
        if (!existing && queue.length > 1) {
          const newQueue = [...queue.slice(1), queue[0]];
          for (let i = 0; i < newQueue.length; i++) {
            await supabase.from('trash_queue').update({ position: i }).eq('id', newQueue[i].id);
          }
        }
        return ok({ ok: true });
      }

      if (action === 'unmarkDone') {
        const { today, completedById, queue } = body;
        if (completedById && queue.length > 1) {
          const q = [...queue];
          const idx = q.findIndex(i => i.person_id === completedById);
          if (idx > 0) {
            const [person] = q.splice(idx, 1);
            q.unshift(person);
            for (let i = 0; i < q.length; i++) {
              await supabase.from('trash_queue').update({ position: i }).eq('id', q[i].id);
            }
          }
        }
        const { error } = await supabase.from('trash_completions').delete().eq('completed_date', today);
        if (error) return err(500, error.message);
        return ok({ ok: true });
      }

      if (action === 'addToQueue') {
        const { personId, position } = body;
        const { error } = await supabase.from('trash_queue').insert({ person_id: personId, position });
        if (error) return err(500, error.message);
        return ok({ ok: true });
      }

      if (action === 'removeFromQueue') {
        const { id, remaining } = body;
        await supabase.from('trash_queue').delete().eq('id', id);
        for (let i = 0; i < remaining.length; i++) {
          await supabase.from('trash_queue').update({ position: i }).eq('id', remaining[i].id);
        }
        return ok({ ok: true });
      }

      if (action === 'insertIntoQueue') {
        const { personId, afterIndex, currentQueue } = body;
        await supabase.from('trash_queue').delete().neq('id', 0);
        const inserts = [
          ...currentQueue.slice(0, afterIndex).map((q, i) => ({ person_id: q.person_id, position: i })),
          { person_id: personId, position: afterIndex },
          ...currentQueue.slice(afterIndex).map((q, i) => ({ person_id: q.person_id, position: afterIndex + 1 + i })),
        ];
        const { error } = await supabase.from('trash_queue').insert(inserts);
        if (error) return err(500, error.message);
        return ok({ ok: true });
      }
    }
  }

  // ── CLEANING ──────────────────────────────────────────────────────────────
  if (path === '/cleaning') {
    if (method === 'GET') {
      const [groupsRes, settingsRes, postponementsRes] = await Promise.all([
        supabase.from('cleaning_groups').select('*, cleaning_group_members(person_id)'),
        supabase.from('cleaning_settings').select('*').eq('id', 1).single(),
        supabase.from('cleaning_postponements').select('*'),
      ]);
      return ok({
        groups: (groupsRes.data || []).map(g => ({
          ...g,
          members: g.cleaning_group_members.map(m => m.person_id),
        })),
        settings: settingsRes.data || { start_date: null, start_group_id: null },
        postponements: postponementsRes.data || [],
      });
    }

    if (method === 'POST') {
      const { action } = body;

      if (action === 'createGroup') {
        const { name, memberIds } = body;
        const { data: group, error } = await supabase.from('cleaning_groups').insert({ name }).select().single();
        if (error) return err(500, error.message);
        const { error: memberErr } = await supabase.from('cleaning_group_members')
          .insert(memberIds.map(person_id => ({ group_id: group.id, person_id })));
        if (memberErr) return err(500, memberErr.message);
        return created({ ok: true });
      }

      if (action === 'removeGroup') {
        const { id, currentStartGroupId } = body;
        if (currentStartGroupId === id) {
          await supabase.from('cleaning_settings').update({ start_date: null, start_group_id: null }).eq('id', 1);
        }
        await supabase.from('cleaning_group_members').delete().eq('group_id', id);
        await supabase.from('cleaning_postponements').delete().eq('group_id', id);
        const { error } = await supabase.from('cleaning_groups').delete().eq('id', id);
        if (error) return err(500, error.message);
        return ok({ ok: true });
      }

      if (action === 'saveSettings') {
        const { startDate, startGroupId, clearPostponements } = body;
        const { error } = await supabase.from('cleaning_settings').update({
          start_date: startDate || null,
          start_group_id: startGroupId,
        }).eq('id', 1);
        if (error) return err(500, error.message);
        if (clearPostponements) {
          await supabase.from('cleaning_postponements').delete().neq('id', 0);
        }
        return ok({ ok: true });
      }

      if (action === 'postpone') {
        const { originalDate, newDate, groupId, groupName } = body;
        const { error } = await supabase.from('cleaning_postponements').insert({
          original_date: originalDate, new_date: newDate, group_id: groupId, group_name: groupName,
        });
        if (error) return err(500, error.message);
        return created({ ok: true });
      }

      if (action === 'cancelPostponement') {
        const { error } = await supabase.from('cleaning_postponements').delete().eq('id', body.id);
        if (error) return err(500, error.message);
        return ok({ ok: true });
      }
    }
  }

  // ── BIRTHDAYS ─────────────────────────────────────────────────────────────
  if (path === '/birthdays') {
    if (method === 'GET') {
      const { data, error } = await supabase.from('birthdays').select('*');
      if (error) return err(500, error.message);
      return ok(data || []);
    }
    if (method === 'POST') {
      const { personId, date } = body;
      if (!date) {
        const { error } = await supabase.from('birthdays').delete().eq('person_id', personId);
        if (error) return err(500, error.message);
      } else {
        const { error } = await supabase.from('birthdays').upsert(
          { person_id: personId, birth_date: date },
          { onConflict: 'person_id' }
        );
        if (error) return err(500, error.message);
      }
      return ok({ ok: true });
    }
  }

  // ── VITALNYA ──────────────────────────────────────────────────────────────
  if (path === '/vitalnya') {
    if (method === 'GET') {
      const { data, error } = await supabase.from('vitalnya_bookings').select('*').order('booking_date');
      if (error) return err(500, error.message);
      return ok(data || []);
    }
    if (method === 'POST') {
      const { booking_date, time_start, time_end, name, strict } = body;
      const { error } = await supabase.from('vitalnya_bookings')
        .insert({ booking_date, time_start, time_end, name, strict });
      if (error) return err(500, error.message);
      return created({ ok: true });
    }
    if (method === 'DELETE') {
      const { error } = await supabase.from('vitalnya_bookings').delete().eq('id', body.id);
      if (error) return err(500, error.message);
      return ok({ ok: true });
    }
  }

  return err(404, 'Not found');
};
