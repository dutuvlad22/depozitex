import type { SupabaseClient } from "@supabase/supabase-js";
import type { Period } from "./period";

// Interogarile rapoartelor, folosite atat de pagini cat si de exportul CSV.
// API-ul intoarce maxim 1000 de randuri pe cerere, asa ca listele se citesc
// pe pagini (fetchAll); totalurile vin deja agregate din functiile SQL.

const PAGE_SIZE = 1000;
export const EXPORT_MAX_ROWS = 50_000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function fetchAll<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < EXPORT_MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export type ClientOption = { id: string; name: string };

export function getClients(supabase: SupabaseClient, orgId: string) {
  return fetchAll<ClientOption>((a, b) =>
    supabase.from("clients").select("id, name").eq("organization_id", orgId).order("name").range(a, b)
  );
}

// ---------- 1. Activitate per client ----------

export type ClientActivityRow = {
  client_id: string;
  client_name: string;
  orders_received: number;
  orders_shipped: number;
  units_shipped: number;
  receipts_count: number;
  units_received: number;
  returns_count: number;
  units_returned: number;
  units_in_stock: number;
};

export function getClientActivity(supabase: SupabaseClient, orgId: string, period: Period) {
  return fetchAll<ClientActivityRow>((a, b) =>
    supabase
      .rpc("report_client_activity", { p_organization_id: orgId, p_from: period.from, p_to: period.to })
      .range(a, b)
  );
}

// ---------- 2. Stoc ----------

export type StockRow = {
  product_id: string;
  client_id: string;
  client_name: string;
  sku: string;
  product_name: string;
  quantity: number;
  reorder_point: number;
  locations: string;
  last_movement_at: string | null;
  status: "ok" | "scazut" | "epuizat";
};

export const STOCK_FILTERS = [
  { key: "", label: "Toate produsele" },
  { key: "sub-prag", label: "Sub prag sau epuizate" },
  { key: "epuizat", label: "Doar epuizate" },
  { key: "fara-miscare", label: "Fara miscare de 60+ zile" },
] as const;

const STALE_DAYS = 60;

export function daysSince(iso: string | null): number | null {
  return iso ? Math.floor((Date.now() - Date.parse(iso)) / 86_400_000) : null;
}

export async function getStock(
  supabase: SupabaseClient,
  orgId: string,
  clientId: string | null,
  filter: string
) {
  const rows = await fetchAll<StockRow>((a, b) =>
    supabase
      .rpc("report_stock", { p_organization_id: orgId, p_client_id: clientId })
      .range(a, b)
  );
  switch (filter) {
    case "sub-prag":
      return rows.filter((r) => r.status !== "ok");
    case "epuizat":
      return rows.filter((r) => r.status === "epuizat");
    case "fara-miscare":
      // doar produse care au stoc (altfel "fara miscare" nu inseamna nimic)
      return rows.filter((r) => r.quantity > 0 && (daysSince(r.last_movement_at) ?? Infinity) >= STALE_DAYS);
    default:
      return rows;
  }
}

// ---------- 3. Jurnal miscari ----------

export const MOVEMENT_TYPES = [
  { key: "receptie", label: "Receptie" },
  { key: "pick", label: "Pick comanda" },
  { key: "retur", label: "Retur in stoc" },
  { key: "ajustare", label: "Ajustare" },
] as const;

export type MovementRow = {
  id: string;
  created_at: string;
  movement_type: string;
  quantity_change: number;
  reference_label: string | null;
  sku: string;
  product_name: string;
  client_name: string;
  location_code: string | null;
  warehouse_name: string | null;
  created_by_email: string | null;
};

export type MovementFilters = {
  period: Period;
  clientId: string | null;
  type: string | null;
  search: string;
};

const MOVEMENT_COLUMNS =
  "id, created_at, movement_type, quantity_change, reference_label, sku, product_name, client_name, location_code, warehouse_name, created_by_email";

const bucharestParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Bucharest",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

/** Diferenta ora Romaniei - UTC la momentul dat (+2h iarna, +3h vara). */
function bucharestOffsetMs(ms: number): number {
  const p = Object.fromEntries(bucharestParts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wall - ms;
}

/** 00:00 ora Romaniei in ziua data, ca ISO UTC (independent de fusul orar al serverului). */
function bucharestMidnight(day: string): string {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  return new Date(utcMidnight - bucharestOffsetMs(utcMidnight)).toISOString();
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function movementsQuery(
  supabase: SupabaseClient,
  orgId: string,
  f: MovementFilters,
  count: boolean
) {
  let q = supabase
    .from("stock_movements_report")
    .select(MOVEMENT_COLUMNS, count ? { count: "exact" } : undefined)
    .eq("organization_id", orgId)
    .gte("created_at", bucharestMidnight(f.period.from))
    .lt("created_at", bucharestMidnight(nextDay(f.period.to)));
  if (f.clientId) q = q.eq("client_id", f.clientId);
  if (f.type) q = q.eq("movement_type", f.type);
  // caracterele cu rol in sintaxa filtrelor PostgREST nu au ce cauta intr-un SKU cautat
  const needle = f.search.replace(/[,()*%"\\]/g, " ").trim();
  if (needle) q = q.or(`sku.ilike.*${needle}*,product_name.ilike.*${needle}*`);
  return q.order("created_at", { ascending: false }).order("id");
}

export const MOVEMENTS_PER_PAGE = 100;

export async function getMovementsPage(
  supabase: SupabaseClient,
  orgId: string,
  f: MovementFilters,
  page: number
) {
  const from = (page - 1) * MOVEMENTS_PER_PAGE;
  const { data, count, error } = await movementsQuery(supabase, orgId, f, true).range(
    from,
    from + MOVEMENTS_PER_PAGE - 1
  );
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as MovementRow[], total: count ?? 0 };
}

export function getAllMovements(supabase: SupabaseClient, orgId: string, f: MovementFilters) {
  return fetchAll<MovementRow>((a, b) => movementsQuery(supabase, orgId, f, false).range(a, b));
}

// ---------- 4. Performanta ----------

export type PerformanceDay = {
  day: string;
  orders_received: number;
  orders_shipped: number;
  units_shipped: number;
  avg_hours_to_ship: number | null;
};

export type PerformanceSummary = {
  orders_received: number;
  orders_shipped: number;
  median_hours: number | null;
  p90_hours: number | null;
  shipped_within_24h: number | null;
};

export type OpenOrder = {
  id: string;
  order_no: string;
  status: string;
  created_at: string;
  clients: { name: string } | null;
};

export async function getPerformance(supabase: SupabaseClient, orgId: string, period: Period) {
  const args = { p_organization_id: orgId, p_from: period.from, p_to: period.to };
  const [days, summary] = await Promise.all([
    fetchAll<PerformanceDay>((a, b) => supabase.rpc("report_performance_daily", args).range(a, b)),
    supabase.rpc("report_performance_summary", args).single<PerformanceSummary>(),
  ]);
  if (summary.error) throw new Error(summary.error.message);
  return { days, summary: summary.data };
}

/** Comenzile inca neexpediate, cele mai vechi primele (independent de perioada). */
export async function getOpenOrders(supabase: SupabaseClient, orgId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_no, status, created_at, clients(name)")
    .eq("organization_id", orgId)
    .in("status", ["nou", "de_pregatit", "la_ambalare", "ambalat"])
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OpenOrder[];
}

export function hoursSince(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 3_600_000);
}
