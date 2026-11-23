import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;

function ok(body) {
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function created(body) {
  return { statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function err(statusCode, message) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: message }) };
}

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function authedUser(event) {
  const authHeader = event.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const { data: { user }, error } = await adminClient().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

async function getUserMembership(userId, admin) {
  const { data } = await admin
    .from('coliving_members')
    .select('coliving_id, role, linked_person_id, colivings(id, name)')
    .eq('user_id', userId)
    .single();
  return data || null;
}

export const handler = async (event) => {
  const path = event.path.replace(/^\/api/, '') || '/';
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};
  const admin = adminClient();

  // ── AUTH ROUTES (no token required) ───────────────────────────────────────

  if (method === 'POST' && path === '/auth/signin') {
    const { email, password } = body;
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    let { data, error } = await anonClient.auth.signInWithPassword({ email, password });
    if (error) {
      // Supabase returns "Invalid login credentials" for unconfirmed emails.
      // Auto-confirm and retry once.
      const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const existing = (users || []).find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (existing && !existing.email_confirmed_at) {
        await admin.auth.admin.updateUserById(existing.id, { email_confirm: true });
        ({ data, error } = await anonClient.auth.signInWithPassword({ email, password }));
      }
      if (error) return err(401, error.message);
    }
    return ok({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      email: data.user.email,
      userId: data.user.id,
    });
  }

  if (method === 'POST' && path === '/auth/signup') {
    const { email, password } = body;
    const { error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (createErr) {
      const msg = createErr.message?.toLowerCase() || '';
      if (msg.includes('already') || msg.includes('exists')) {
        // User exists — confirm them if unconfirmed so sign-in can proceed
        const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const existing = (users || []).find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (existing && !existing.email_confirmed_at) {
          await admin.auth.admin.updateUserById(existing.id, { email_confirm: true });
          // fall through to sign in
        } else {
          return err(409, 'An account with this email already exists. Please sign in.');
        }
      } else {
        return err(400, createErr.message);
      }
    }
    const { data, error: signInErr } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
      .auth.signInWithPassword({ email, password });
    if (signInErr) return err(401, signInErr.message);
    return ok({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      email: data.user.email,
      userId: data.user.id,
    });
  }

  if (method === 'POST' && path === '/auth/refresh') {
    const { refresh_token } = body;
    if (!refresh_token) return err(400, 'refresh_token required');
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token }),
    });
    const data = await res.json();
    if (!res.ok) return err(401, data.error_description || 'Session expired');
    return ok({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    });
  }

  if (method === 'POST' && path === '/auth/reset-password') {
    const { email, redirectTo } = body;
    if (!email) return err(400, 'Email is required');
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { error } = await anonClient.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo || undefined,
    });
    if (error) return err(500, error.message);
    return ok({ ok: true });
  }

  if (method === 'POST' && path === '/auth/update-password') {
    const user = await authedUser(event);
    if (!user) return err(401, 'Invalid or expired reset token');
    const { password } = body;
    if (!password || password.length < 6) return err(400, 'Password must be at least 6 characters');
    const { error } = await admin.auth.admin.updateUserById(user.id, { password });
    if (error) return err(500, error.message);
    return ok({ ok: true });
  }

  if (method === 'POST' && path === '/auth/signout') {
    const authHeader = event.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: authHeader },
      });
    }
    return ok({ ok: true });
  }

  // ── ALL OTHER ROUTES REQUIRE AUTH ─────────────────────────────────────────
  const user = await authedUser(event);
  if (!user) return err(401, 'Unauthorized');

  // GET /me
  if (method === 'GET' && path === '/me') {
    const membership = await getUserMembership(user.id, admin);
    if (!membership) return ok(null);
    return ok({
      colivingId: membership.coliving_id,
      colivingName: membership.colivings.name,
      role: membership.role,
      linkedPersonId: membership.linked_person_id,
    });
  }

  // POST /colivings — create a new coliving + owner membership
  if (method === 'POST' && path === '/colivings') {
    const { name } = body;
    if (!name?.trim()) return err(400, 'Name is required');
    const { data: coliving, error: ce } = await admin
      .from('colivings').insert({ name: name.trim() }).select().single();
    if (ce) return err(500, ce.message);
    const { error: me } = await admin.from('coliving_members').insert({
      coliving_id: coliving.id,
      user_id: user.id,
      role: 'owner',
    });
    if (me) return err(500, me.message);
    return created({ colivingId: coliving.id, colivingName: coliving.name, role: 'owner' });
  }

  // GET /invitations/pending — look up unaccepted invite by email (no coliving needed)
  if (method === 'GET' && path === '/invitations/pending') {
    const { data } = await admin
      .from('invitations')
      .select('id, coliving_id, colivings(name)')
      .eq('invited_email', user.email.toLowerCase())
      .eq('accepted', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);
    if (!data?.length) return ok(null);
    const inv = data[0];
    return ok({ id: inv.id, colivingId: inv.coliving_id, colivingName: inv.colivings.name });
  }

  // POST /invitations/accept
  if (method === 'POST' && path === '/invitations/accept') {
    const { invitationId } = body;
    const { data: inv, error: ie } = await admin
      .from('invitations')
      .select('*')
      .eq('id', invitationId)
      .eq('invited_email', user.email.toLowerCase())
      .eq('accepted', false)
      .gt('expires_at', new Date().toISOString())
      .single();
    if (ie || !inv) return err(404, 'Invitation not found or expired');
    const { error: me } = await admin.from('coliving_members').upsert(
      { coliving_id: inv.coliving_id, user_id: user.id, role: 'member' },
      { onConflict: 'coliving_id,user_id' }
    );
    if (me) return err(500, me.message);
    await admin.from('invitations').update({ accepted: true }).eq('id', invitationId);
    const { data: col } = await admin.from('colivings').select('name').eq('id', inv.coliving_id).single();
    return ok({ colivingId: inv.coliving_id, colivingName: col.name, role: 'member' });
  }

  // ── COLIVING REQUIRED ─────────────────────────────────────────────────────
  const membership = await getUserMembership(user.id, admin);
  if (!membership) return err(403, 'Not a member of any coliving');
  const colivingId = membership.coliving_id;
  const role = membership.role;

  // PUT /colivings — update name / telegram config
  if (method === 'PUT' && path === '/colivings') {
    if (role !== 'owner') return err(403, 'Only owners can update coliving settings');
    const updates = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.telegramBotToken !== undefined) updates.telegram_bot_token = body.telegramBotToken || null;
    if (body.telegramChatId !== undefined) updates.telegram_chat_id = body.telegramChatId || null;
    const { error } = await admin.from('colivings').update(updates).eq('id', colivingId);
    if (error) return err(500, error.message);
    return ok({ ok: true });
  }

  // GET /colivings/members
  if (method === 'GET' && path === '/colivings/members') {
    const { data: members, error } = await admin
      .from('coliving_members')
      .select('id, role, linked_person_id, joined_at, user_id')
      .eq('coliving_id', colivingId);
    if (error) return err(500, error.message);
    const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const emailMap = Object.fromEntries((users || []).map(u => [u.id, u.email]));
    return ok(members.map(m => ({
      id: m.id,
      role: m.role,
      linkedPersonId: m.linked_person_id,
      joinedAt: m.joined_at,
      email: emailMap[m.user_id] || '(unknown)',
    })));
  }

  // DELETE /colivings/members — kick member (owner) or leave (self)
  if (method === 'DELETE' && path === '/colivings/members') {
    const { memberId } = body;
    // Fetch the target membership
    const { data: target } = await admin
      .from('coliving_members').select('*').eq('id', memberId).eq('coliving_id', colivingId).single();
    if (!target) return err(404, 'Member not found');
    const isSelf = target.user_id === user.id;
    if (!isSelf && role !== 'owner') return err(403, 'Only owners can remove other members');
    if (isSelf && role === 'owner') return err(400, 'Owners cannot leave. Transfer ownership or delete the coliving first.');
    const { error } = await admin.from('coliving_members').delete().eq('id', memberId);
    if (error) return err(500, error.message);
    return ok({ ok: true });
  }

  // POST /me/leave
  if (method === 'POST' && path === '/me/leave') {
    if (role === 'owner') return err(400, 'Owners cannot leave. Transfer ownership or delete the coliving first.');
    const { error } = await admin
      .from('coliving_members').delete().eq('coliving_id', colivingId).eq('user_id', user.id);
    if (error) return err(500, error.message);
    return ok({ ok: true });
  }

  // POST /invitations — invite by email (owner only)
  if (method === 'POST' && path === '/invitations') {
    if (role !== 'owner') return err(403, 'Only owners can invite members');
    const { email, redirectTo } = body;
    if (!email) return err(400, 'Email is required');
    const normalEmail = email.toLowerCase().trim();
    const { error: ie } = await admin.from('invitations').insert({
      coliving_id: colivingId,
      invited_email: normalEmail,
      invited_by: user.id,
    });
    if (ie) return err(500, ie.message);
    const { error: invErr } = await admin.auth.admin.inviteUserByEmail(normalEmail, {
      redirectTo: redirectTo || undefined,
    });
    // 'already registered' means they just need to sign in & accept — that's fine
    if (invErr && !invErr.message?.toLowerCase().includes('already registered')) {
      return err(500, invErr.message);
    }
    return created({ ok: true });
  }

  // POST /me/link-person
  if (method === 'POST' && path === '/me/link-person') {
    const { personId } = body;
    const { error } = await admin
      .from('coliving_members')
      .update({ linked_person_id: personId || null })
      .eq('coliving_id', colivingId)
      .eq('user_id', user.id);
    if (error) return err(500, error.message);
    return ok({ ok: true });
  }

  // ── PEOPLE ────────────────────────────────────────────────────────────────
  if (path === '/people') {
    if (method === 'GET') {
      const { data, error } = await admin.from('people').select('*').eq('coliving_id', colivingId).order('id');
      if (error) return err(500, error.message);
      return ok(data);
    }
    if (method === 'POST') {
      const { data, error } = await admin
        .from('people').insert({ name: body.name, coliving_id: colivingId }).select().single();
      if (error) return err(500, error.message);
      return created(data);
    }
    if (method === 'DELETE') {
      const { id } = body;
      await Promise.all([
        admin.from('trash_completions').delete().eq('completed_by', id),
        admin.from('trash_queue').delete().eq('person_id', id),
        admin.from('birthdays').delete().eq('person_id', id),
        admin.from('cleaning_group_members').delete().eq('person_id', id),
        admin.from('coliving_members').update({ linked_person_id: null }).eq('linked_person_id', id),
      ]);
      const { error } = await admin.from('people').delete().eq('id', id).eq('coliving_id', colivingId);
      if (error) return err(500, error.message);
      return ok({ ok: true });
    }
  }

  // ── TRASH ─────────────────────────────────────────────────────────────────
  if (path === '/trash') {
    if (method === 'GET') {
      const [queueRes, completionRes] = await Promise.all([
        admin.from('trash_queue')
          .select('id, position, person_id, people!inner(coliving_id)')
          .eq('people.coliving_id', colivingId)
          .order('position'),
        admin.from('trash_completions')
          .select('id, completed_date, completed_by, people!inner(coliving_id)')
          .eq('people.coliving_id', colivingId)
          .order('completed_date', { ascending: false })
          .limit(1),
      ]);
      const queue = (queueRes.data || []).map(({ people: _, ...rest }) => rest);
      const raw = completionRes.data?.[0];
      const completion = raw ? (({ people: _, ...rest }) => rest)(raw) : null;
      return ok({ queue, completion });
    }

    if (method === 'POST') {
      const { action } = body;

      if (action === 'markDone') {
        const { today, currentPersonId, queue } = body;
        const { data: existing } = await admin
          .from('trash_completions').select('id').eq('completed_date', today).maybeSingle();
        const { error } = await admin.from('trash_completions').upsert(
          { completed_date: today, completed_by: currentPersonId },
          { onConflict: 'completed_date' }
        );
        if (error) return err(500, error.message);
        if (!existing && queue.length > 1) {
          const newQueue = [...queue.slice(1), queue[0]];
          for (let i = 0; i < newQueue.length; i++) {
            await admin.from('trash_queue').update({ position: i }).eq('id', newQueue[i].id);
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
              await admin.from('trash_queue').update({ position: i }).eq('id', q[i].id);
            }
          }
        }
        const { error } = await admin.from('trash_completions').delete().eq('completed_date', today);
        if (error) return err(500, error.message);
        return ok({ ok: true });
      }

      if (action === 'addToQueue') {
        const { personId, position } = body;
        const { error } = await admin.from('trash_queue').insert({ person_id: personId, position });
        if (error) return err(500, error.message);
        return ok({ ok: true });
      }

      if (action === 'removeFromQueue') {
        const { id, remaining } = body;
        await admin.from('trash_queue').delete().eq('id', id);
        for (let i = 0; i < remaining.length; i++) {
          await admin.from('trash_queue').update({ position: i }).eq('id', remaining[i].id);
        }
        return ok({ ok: true });
      }

      if (action === 'insertIntoQueue') {
        const { personId, afterIndex, currentQueue } = body;
        // Delete only this coliving's current queue entries, then re-insert
        const queueIds = currentQueue.map(q => q.id);
        if (queueIds.length > 0) {
          await admin.from('trash_queue').delete().in('id', queueIds);
        }
        const inserts = [
          ...currentQueue.slice(0, afterIndex).map((q, i) => ({ person_id: q.person_id, position: i })),
          { person_id: personId, position: afterIndex },
          ...currentQueue.slice(afterIndex).map((q, i) => ({ person_id: q.person_id, position: afterIndex + 1 + i })),
        ];
        const { error } = await admin.from('trash_queue').insert(inserts);
        if (error) return err(500, error.message);
        return ok({ ok: true });
      }
    }
  }

  // ── CLEANING ──────────────────────────────────────────────────────────────
  if (path === '/cleaning') {
    if (method === 'GET') {
      const [groupsRes, settingsRes] = await Promise.all([
        admin.from('cleaning_groups')
          .select('*, cleaning_group_members(person_id)')
          .eq('coliving_id', colivingId),
        admin.from('cleaning_settings')
          .select('*')
          .eq('coliving_id', colivingId)
          .maybeSingle(),
      ]);
      const groupIds = (groupsRes.data || []).map(g => g.id);
      let postponements = [];
      if (groupIds.length > 0) {
        const { data } = await admin.from('cleaning_postponements').select('*').in('group_id', groupIds);
        postponements = data || [];
      }
      return ok({
        groups: (groupsRes.data || []).map(g => ({
          ...g,
          members: g.cleaning_group_members.map(m => m.person_id),
        })),
        settings: settingsRes.data || { start_date: null, start_group_id: null },
        postponements,
      });
    }

    if (method === 'POST') {
      const { action } = body;

      if (action === 'createGroup') {
        const { name, memberIds } = body;
        const { data: group, error } = await admin
          .from('cleaning_groups').insert({ name, coliving_id: colivingId }).select().single();
        if (error) return err(500, error.message);
        const { error: memberErr } = await admin
          .from('cleaning_group_members')
          .insert(memberIds.map(person_id => ({ group_id: group.id, person_id })));
        if (memberErr) return err(500, memberErr.message);
        return created({ ok: true });
      }

      if (action === 'removeGroup') {
        const { id, currentStartGroupId } = body;
        if (currentStartGroupId === id) {
          await admin.from('cleaning_settings')
            .update({ start_date: null, start_group_id: null })
            .eq('coliving_id', colivingId);
        }
        await admin.from('cleaning_group_members').delete().eq('group_id', id);
        await admin.from('cleaning_postponements').delete().eq('group_id', id);
        const { error } = await admin.from('cleaning_groups').delete().eq('id', id).eq('coliving_id', colivingId);
        if (error) return err(500, error.message);
        return ok({ ok: true });
      }

      if (action === 'saveSettings') {
        const { startDate, startGroupId, clearPostponements } = body;
        const { error } = await admin.from('cleaning_settings').upsert(
          { coliving_id: colivingId, start_date: startDate || null, start_group_id: startGroupId },
          { onConflict: 'coliving_id' }
        );
        if (error) return err(500, error.message);
        if (clearPostponements) {
          const { data: groups } = await admin
            .from('cleaning_groups').select('id').eq('coliving_id', colivingId);
          const gids = (groups || []).map(g => g.id);
          if (gids.length > 0) {
            await admin.from('cleaning_postponements').delete().in('group_id', gids);
          }
        }
        return ok({ ok: true });
      }

      if (action === 'postpone') {
        const { originalDate, newDate, groupId, groupName } = body;
        const { error } = await admin.from('cleaning_postponements').insert({
          original_date: originalDate, new_date: newDate, group_id: groupId, group_name: groupName,
        });
        if (error) return err(500, error.message);
        return created({ ok: true });
      }

      if (action === 'cancelPostponement') {
        const { error } = await admin.from('cleaning_postponements').delete().eq('id', body.id);
        if (error) return err(500, error.message);
        return ok({ ok: true });
      }
    }
  }

  // ── BIRTHDAYS ─────────────────────────────────────────────────────────────
  if (path === '/birthdays') {
    if (method === 'GET') {
      const { data, error } = await admin
        .from('birthdays')
        .select('id, person_id, birth_date, people!inner(coliving_id)')
        .eq('people.coliving_id', colivingId);
      if (error) return err(500, error.message);
      return ok((data || []).map(({ people: _, ...rest }) => rest));
    }
    if (method === 'POST') {
      const { personId, date } = body;
      if (!date) {
        const { error } = await admin.from('birthdays').delete().eq('person_id', personId);
        if (error) return err(500, error.message);
      } else {
        const { error } = await admin.from('birthdays').upsert(
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
      const { data, error } = await admin
        .from('vitalnya_bookings').select('*').eq('coliving_id', colivingId).order('booking_date');
      if (error) return err(500, error.message);
      return ok(data || []);
    }
    if (method === 'POST') {
      const { booking_date, time_start, time_end, name, strict } = body;
      const { error } = await admin.from('vitalnya_bookings')
        .insert({ booking_date, time_start, time_end, name, strict, coliving_id: colivingId });
      if (error) return err(500, error.message);
      return created({ ok: true });
    }
    if (method === 'DELETE') {
      const { error } = await admin
        .from('vitalnya_bookings').delete().eq('id', body.id).eq('coliving_id', colivingId);
      if (error) return err(500, error.message);
      return ok({ ok: true });
    }
  }

  return err(404, 'Not found');
};
