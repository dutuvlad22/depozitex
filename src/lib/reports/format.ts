import { formatDateTime } from "./csv";

const intFmt = new Intl.NumberFormat("ro-RO");
const decFmt = new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function fmtInt(n: number | null | undefined): string {
  return intFmt.format(n ?? 0);
}

/** 5,5 h / 2,3 zile (peste 48 de ore zilele sunt mai usor de citit). */
export function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined) return "—";
  return h < 48 ? `${decFmt.format(h)} h` : `${decFmt.format(h / 24)} zile`;
}

/** 26.09.2026 14:05 in ora Romaniei. */
export function fmtDateTime(iso: string | null): string {
  const s = formatDateTime(iso);
  if (!s) return "—";
  const [day, time] = s.split(" ");
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y} ${time}`;
}

/** Transforma query-ul unui Route Handler in obiectul primit si de pagini. */
export function searchParamsOf(url: { searchParams: URLSearchParams }): Record<string, string> {
  return Object.fromEntries(url.searchParams.entries());
}
