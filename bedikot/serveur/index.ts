// Rappels des bedikot : API de l'app web + envoi des notifications (appelé chaque minute par pg_cron).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';
import { buildPlan, message, todayIn, zmanimFor, addDays, Sub } from './plan.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SETTINGS = ['before_shkia', 'before_alot', 'repeat_every', 'morning_window', 'hefsek_reminder', 'show_bediavad'] as const;
const UUID = /^[0-9a-f-]{36}$/i;

let vapid: { publicKey: string; privateKey: string } | null = null;
async function getVapid() {
  if (vapid) return vapid;
  const { data } = await db.from('bedikot_config').select('value').eq('key', 'vapid').maybeSingle();
  if (data?.value) vapid = data.value;
  else {
    const keys = webpush.generateVAPIDKeys();
    await db.from('bedikot_config').upsert({ key: 'vapid', value: keys });
    vapid = keys;
  }
  webpush.setVapidDetails('https://jonathanazoulay01-eng.github.io/', vapid!.publicKey, vapid!.privateKey);
  return vapid!;
}

async function load(id: string) {
  const { data } = await db.from('bedikot_subs').select('*').eq('id', id).maybeSingle();
  return data;
}

function state(row: any) {
  const plan = buildPlan(row as Sub);
  const today = todayIn(row.tz);
  return {
    id: row.id,
    settings: Object.fromEntries(SETTINGS.map((k) => [k, row[k]])),
    place: row.place,
    lat: row.lat,
    lon: row.lon,
    tz: row.tz,
    hefsek_date: row.hefsek_date,
    has_push: !!row.sub,
    today,
    zmanim_today: zmanimFor(today, row),
    plan,
    done: row.done ?? {},
    snooze: row.snooze ?? {},
  };
}

async function send(row: any, payload: object) {
  try {
    await webpush.sendNotification(row.sub, JSON.stringify(payload), { TTL: 600, urgency: 'high' });
    return true;
  } catch (e: any) {
    if (e?.statusCode === 404 || e?.statusCode === 410) await db.from('bedikot_subs').update({ sub: null }).eq('id', row.id);
    console.error('push', row.id, e?.statusCode, e?.body ?? String(e));
    return false;
  }
}

// contenu de la notification + ce qu'il faut pour les boutons « C'est fait » / « Me rappeler dans 20 min »
const payload = (row: any, slot: any) => ({
  ...message(slot, 0, 0, row.tz, !!row.show_bediavad),
  url: './?slot=' + slot.id,
  id: row.id,
  actions: [
    { action: 'done', title: "C'est fait ✓" },
    { action: 'snooze', title: 'Me rappeler dans 20 min' },
  ],
});

async function tick() {
  await getVapid();
  const since = addDays(new Date().toISOString().slice(0, 10), -9);
  const { data: rows } = await db.from('bedikot_subs').select('*').not('sub', 'is', null).gte('hefsek_date', since);
  const now = Date.now();
  let sent = 0;
  for (const row of rows ?? []) {
    const done = row.done ?? {};
    const last = { ...(row.sent ?? {}) };
    const snooze = { ...(row.snooze ?? {}) };
    let changed = false;
    let snoozeChanged = false;
    for (const slot of buildPlan(row as Sub)) {
      if (done[slot.id]) continue;
      // « Me rappeler dans 20 min » : on renvoie le rappel à l'heure demandée (tant que la plage n'est pas finie)
      if (snooze[slot.id] && Date.parse(snooze[slot.id]) <= now) {
        delete snooze[slot.id];
        snoozeChanged = true;
        if (now < Date.parse(slot.end) && (await send(row, payload(row, slot)))) sent++;
        continue;
      }
      // dernier rappel prévu déjà passé (moins de 8 min de retard toléré)
      let idx = -1;
      slot.times.forEach((t, i) => {
        const ts = Date.parse(t);
        if (ts <= now && now - ts < 8 * 60_000) idx = i;
      });
      if (idx < 0) continue;
      const due = slot.times[idx];
      if (last[slot.id] && last[slot.id] >= due) continue;
      if (await send(row, payload(row, slot))) sent++;
      last[slot.id] = due;
      changed = true;
    }
    if (changed || snoozeChanged) await db.from('bedikot_subs').update({ sent: last, snooze }).eq('id', row.id);
  }
  return { ok: true, checked: rows?.length ?? 0, sent };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const action = body.action;

  try {
    if (action === 'tick') {
      const { data } = await db.from('bedikot_config').select('value').eq('key', 'cron_token').maybeSingle();
      if (!data || data.value !== body.token) return json({ error: 'interdit' }, 403);
      return json(await tick());
    }

    if (action === 'vapid') return json({ publicKey: (await getVapid()).publicKey });

    if (action === 'save') {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of SETTINGS) if (body[k] !== undefined) patch[k] = body[k];
      for (const k of ['lat', 'lon', 'place', 'tz']) if (body[k] !== undefined) patch[k] = body[k];
      if (body.hefsek_date !== undefined) {
        patch.hefsek_date = body.hefsek_date;
        patch.done = {};
        patch.sent = {};
      }
      if (body.sub !== undefined) patch.sub = body.sub;
      let row;
      if (body.id && UUID.test(body.id) && (await load(body.id))) {
        ({ data: row } = await db.from('bedikot_subs').update(patch).eq('id', body.id).select().single());
      } else {
        ({ data: row } = await db.from('bedikot_subs').insert(patch).select().single());
      }
      return json(state(row));
    }

    if (!body.id || !UUID.test(body.id)) return json({ error: 'id manquant' }, 400);
    const row = await load(body.id);
    if (!row) return json({ error: 'inconnu' }, 404);

    if (action === 'state') return json(state(row));

    if (action === 'done') {
      const done = { ...(row.done ?? {}) };
      const snooze = { ...(row.snooze ?? {}) };
      if (body.value === false) delete done[body.slot];
      else {
        done[body.slot] = new Date().toISOString();
        delete snooze[body.slot];
      }
      const { data } = await db.from('bedikot_subs').update({ done, snooze }).eq('id', row.id).select().single();
      return json(state(data));
    }

    if (action === 'snooze') {
      if (typeof body.slot !== 'string' || !/^\d{4}-\d{2}-\d{2}-(matin|soir|hefsek)$/.test(body.slot)) return json({ error: 'créneau inconnu' }, 400);
      const minutes = Math.min(120, Math.max(5, Number(body.minutes) || 20));
      const at = new Date(Date.now() + minutes * 60_000).toISOString();
      const snooze = { ...(row.snooze ?? {}), [body.slot]: at };
      const { data } = await db.from('bedikot_subs').update({ snooze }).eq('id', row.id).select().single();
      return json({ ...state(data), snoozed: { slot: body.slot, at } });
    }

    if (action === 'test') {
      if (!row.sub) return json({ error: 'notifications non activées' }, 400);
      await getVapid();
      const ok = await send(row, {
        title: 'Rappel (essai)',
        body: 'Début : 08:00\nFin : 12:30\n⭐ Ceci est un essai.',
        tag: 'test',
        url: './',
        id: row.id,
        slot: 'test',
        actions: [
          { action: 'done', title: "C'est fait ✓" },
          { action: 'snooze', title: 'Me rappeler dans 20 min' },
        ],
      });
      return json({ ok });
    }

    return json({ error: 'action inconnue' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
