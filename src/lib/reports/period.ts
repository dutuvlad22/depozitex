// Perioade pentru rapoarte: zile calendaristice in ora Romaniei, capete incluse
// (la fel ca functiile report_* din sql/11_rapoarte.sql).

const TZ = "Europe/Bucharest";
const MAX_DAYS = 366;

export type SearchParams = { [key: string]: string | string[] | undefined };

export const PRESETS = [
  { key: "luna-curenta", label: "Luna curenta" },
  { key: "luna-trecuta", label: "Luna trecuta" },
  { key: "ultimele-7", label: "Ultimele 7 zile" },
  { key: "ultimele-30", label: "Ultimele 30 de zile" },
] as const;

type PresetKey = (typeof PRESETS)[number]["key"];

export type Period = { from: string; to: string; preset: PresetKey | null };

export function param(sp: SearchParams, key: string): string {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function todayRo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

function isDay(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

function presetRange(key: PresetKey): { from: string; to: string } {
  const today = todayRo();
  const monthStart = `${today.slice(0, 8)}01`;
  switch (key) {
    case "luna-curenta":
      return { from: monthStart, to: today };
    case "luna-trecuta": {
      const lastMonthEnd = addDays(monthStart, -1);
      return { from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd };
    }
    case "ultimele-7":
      return { from: addDays(today, -6), to: today };
    case "ultimele-30":
      return { from: addDays(today, -29), to: today };
  }
}

/** Perioada din URL: ?perioada=<preset> sau ?de_la=YYYY-MM-DD&pana_la=YYYY-MM-DD. Implicit: luna curenta. */
export function resolvePeriod(sp: SearchParams): Period {
  const from = param(sp, "de_la");
  const to = param(sp, "pana_la");
  if (isDay(from) && isDay(to) && from <= to && daysBetween(from, to) < MAX_DAYS) {
    return { from, to, preset: null };
  }
  const key = (PRESETS.find((p) => p.key === param(sp, "perioada"))?.key ?? "luna-curenta") as PresetKey;
  return { ...presetRange(key), preset: key };
}

export function periodQuery(p: Period): Record<string, string> {
  return p.preset ? { perioada: p.preset } : { de_la: p.from, pana_la: p.to };
}

export function formatDay(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y}`;
}

export function periodLabel(p: Period): string {
  return `${formatDay(p.from)} – ${formatDay(p.to)}`;
}

/** Query string din parametri, fara valorile goale. */
export function qs(params: Record<string, string | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v);
  const out = s.toString();
  return out ? `?${out}` : "";
}
