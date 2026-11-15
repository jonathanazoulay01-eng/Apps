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

export type Zmanim = { alot: string; netz: string; minhaKetana: string; shkia: string };
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
  // Minha kétana selon le Gaon de Vilna (9 h ½ « heures proportionnelles » après le lever du soleil)
  const minhaK = cal.getMinchaKetana(netz, shkia);
  if (!alot || !netz || !shkia || !minhaK) return null;
  return { alot: alot.toUTC().toISO(), netz: netz.toUTC().toISO(), minhaKetana: minhaK.toUTC().toISO(), shkia: shkia.toUTC().toISO() };
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
  const out: Slot[] = [];
  const days: { day: string; label: string; kinds: Slot['kind'][] }[] = [];
  if (s.hefsek_reminder) days.push({ day: s.hefsek_date, label: 'Hefsek tahara', kinds: ['hefsek'] });
  for (let i = 1; i <= 7; i++) days.push({ day: addDays(s.hefsek_date, i), label: `Jour ${i}/7`, kinds: ['matin', 'soir'] });

  for (const d of days) {
    const z = zmanimFor(d.day, s);
    if (!z) continue;
    const shkia = Date.parse(z.shkia);
    for (const kind of d.kinds) {
      // un seul rappel : le matin (par défaut 10 min) avant alot hachahar, l'après-midi à Minha kétana
      const at = kind === 'matin' ? Date.parse(z.alot) - s.before_alot * MIN : Date.parse(z.minhaKetana);
      out.push({
        id: `${d.day}-${kind}`,
        day: d.day,
        kind,
        label: d.label,
        zmanim: z,
        times: [new Date(at).toISOString()],
        end: new Date(shkia).toISOString(),
      });
    }
  }
  return out;
}

// Arrondi dans le sens strict : un début (alot, nets, Minha kétana) à la minute supérieure,
// une fin (chkia) à la minute inférieure.
export const hhmm = (iso: string, tz: string, mode: 'debut' | 'fin' = 'fin') => {
  let t = Date.parse(iso);
  t = mode === 'debut' ? Math.ceil(t / MIN) * MIN : Math.floor(t / MIN) * MIN;
  return new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(t));
};

export function message(slot: Slot, _index: number, _at: number, tz: string) {
  const z = slot.zmanim;
  if (slot.kind === 'matin') {
    return {
      title: `Bedika du matin · ${slot.label}`,
      body: `Bediavad : dès alot hachahar ${hhmm(z.alot, tz, 'debut')}\nLehatehila : dès nets hahama ${hhmm(z.netz, tz, 'debut')}`,
      tag: slot.id,
      slot: slot.id,
    };
  }
  return {
    title: slot.kind === 'hefsek' ? 'Hefsek tahara' : `Bedika de l'après-midi · ${slot.label}`,
    body: `À partir de Minha kétana : ${hhmm(z.minhaKetana, tz, 'debut')}\nAvant la chkia : ${hhmm(z.shkia, tz, 'fin')}`,
    tag: slot.id,
    slot: slot.id,
  };
}
