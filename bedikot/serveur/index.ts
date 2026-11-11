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

const SETTINGS = ['before_shkia', 'before_alot', 'repeat_every', 'morning_window', 'hefsek_reminder'] as const;
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

async function tick() {
  await getVapid();
  const since = addDays(new Date().toISOString().slice(0, 10), -9);
  const { data: rows } = await db.from('bedikot_subs').select('*').not('sub', 'is', null).gte('hefsek_date', since);
  const now = Date.now();
  let sent = 0;
  for (const row of rows ?? []) {
    const done = row.done ?? {};
    const last = { ...(row.sent ?? {}) };
    let changed = false;
    for (const slot of buildPlan(row as Sub)) {
      if (done[slot.id]) continue;
      // dernier rappel prévu déjà passé (moins de 8 min de retard toléré)
      let idx = -1;
      slot.times.forEach((t, i) => {
        const ts = Date.parse(t);
        if (ts <= now && now - ts < 8 * 60_000) idx = i;
      });
      if (idx < 0) continue;
      const due = slot.times[idx];
      if (last[slot.id] && last[slot.id] >= due) continue;
      if (await send(row, { ...message(slot, idx, Date.parse(due), row.tz), url: './?slot=' + slot.id })) sent++;
      last[slot.id] = due;
      changed = true;
    }
    if (changed) await db.from('bedikot_subs').update({ sent: last }).eq('id', row.id);
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
      if (body.value === false) delete done[body.slot];
      else done[body.slot] = new Date().toISOString();
      const { data } = await db.from('bedikot_subs').update({ done }).eq('id', row.id).select().single();
      return json(state(data));
    }

    if (action === 'test') {
      if (!row.sub) return json({ error: 'notifications non activées' }, 400);
      await getVapid();
      const ok = await send(row, {
        title: 'Bedika du soir (essai)',
        body: "Ceci est un essai. Les vrais rappels reviendront toutes les 10 min jusqu'à « C'est fait ».",
        tag: 'test',
        url: './',
      });
      return json({ ok });
    }

    return json({ error: 'action inconnue' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
