// Calcul du programme des bedikot (méthode Roger Stioui, comme Torah-Box) :
// nets / chkia = lever / coucher au niveau de la mer ; alot hachahar = soleil à 16,1° sous l'horizon.
import KZ from 'npm:kosher-zmanim@0.9.0';
const { ComplexZmanimCalendar, GeoLocation } = KZ as any;

export type Sub = {
  lat: number;
  lon: number;
  tz: string;
  hefsek_date: string | null;
  before_shkia: number;
  before_alot: number; // minutes AVANT alot (négatif = après)
  repeat_every: number;
  morning_window: number;
  hefsek_reminder: boolean;
};

export type Zmanim = { alot: string; netz: string; shkia: string };
export type Slot = {
  id: string; // 2026-11-12-soir
  day: string;
  kind: 'matin' | 'soir' | 'hefsek';
  label: string; // « Jour 3/7 » ou « Hefsek tahara »
  zmanim: Zmanim;
  times: string[]; // ISO
  end: string; // ISO : fin de la fenêtre (chkia)
};

const MIN = 60_000;

export function zmanimFor(day: string, s: Pick<Sub, 'lat' | 'lon' | 'tz'>): Zmanim | null {
  const geo = new GeoLocation('lieu', s.lat, s.lon, 0, s.tz);
  const cal = new ComplexZmanimCalendar(geo);
  cal.setDate(day);
  const alot = cal.getSunriseOffsetByDegrees(90 + 16.1);
  const netz = cal.getSeaLevelSunrise();
  const shkia = cal.getSeaLevelSunset();
  if (!alot || !netz || !shkia) return null;
  return { alot: alot.toUTC().toISO(), netz: netz.toUTC().toISO(), shkia: shkia.toUTC().toISO() };
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function todayIn(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function buildPlan(s: Sub): Slot[] {
  if (!s.hefsek_date) return [];
  const every = Math.max(5, s.repeat_every) * MIN;
  const out: Slot[] = [];
  const days: { day: string; label: string; kinds: Slot['kind'][] }[] = [];
  if (s.hefsek_reminder) days.push({ day: s.hefsek_date, label: 'Hefsek tahara', kinds: ['hefsek'] });
  for (let i = 1; i <= 7; i++) days.push({ day: addDays(s.hefsek_date, i), label: `Jour ${i}/7`, kinds: ['matin', 'soir'] });

  for (const d of days) {
    const z = zmanimFor(d.day, s);
    if (!z) continue;
    const alot = Date.parse(z.alot);
    const shkia = Date.parse(z.shkia);
    for (const kind of d.kinds) {
      const times: number[] = [];
      if (kind === 'matin') {
        const start = alot - s.before_alot * MIN;
        const end = Math.min(alot + s.morning_window * MIN, shkia - s.before_shkia * MIN);
        for (let t = start; t <= end; t += every) times.push(t);
      } else {
        const start = shkia - s.before_shkia * MIN;
        for (let t = start; t < shkia - MIN; t += every) times.push(t);
      }
      if (!times.length) continue;
      out.push({
        id: `${d.day}-${kind}`,
        day: d.day,
        kind,
        label: d.label,
        zmanim: z,
        times: times.map((t) => new Date(t).toISOString()),
        end: new Date(shkia).toISOString(),
      });
    }
  }
  return out;
}

const hhmm = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export function message(slot: Slot, index: number, at: number, tz: string) {
  const title =
    slot.kind === 'hefsek'
      ? 'Hefsek tahara'
      : `${slot.kind === 'matin' ? 'Bedika du matin' : 'Bedika du soir'} · ${slot.label}`;
  let body: string;
  if (slot.kind === 'matin') {
    const alot = Date.parse(slot.zmanim.alot);
    body =
      at < alot
        ? `Alot hachahar à ${hhmm(slot.zmanim.alot, tz)} (dans ${Math.round((alot - at) / MIN)} min).`
        : index === 0
          ? `C'est l'heure : alot hachahar était à ${hhmm(slot.zmanim.alot, tz)}.`
          : `Rappel : la bedika du matin n'est pas encore validée.`;
  } else {
    const left = Math.round((Date.parse(slot.zmanim.shkia) - at) / MIN);
    const what = slot.kind === 'hefsek' ? 'le hefsek tahara' : 'la bedika';
    body =
      index === 0
        ? `Chkia à ${hhmm(slot.zmanim.shkia, tz)} (dans ${left} min). Pense à faire ${what}.`
        : `Rappel : chkia dans ${left} min (${hhmm(slot.zmanim.shkia, tz)}). Ouvre l'app et appuie sur « C'est fait ».`;
  }
  return { title: index === 0 ? title : `⏰ ${title}`, body, tag: slot.id, slot: slot.id };
}
