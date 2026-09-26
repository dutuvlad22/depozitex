import Link from "next/link";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import ReportFilters, { ClientSelect } from "@/components/reports/report-filters";
import { requireOrgContext } from "@/lib/org-context";
import {
  MOVEMENTS_PER_PAGE,
  MOVEMENT_TYPES,
  getClients,
  getMovementsPage,
  type MovementFilters,
} from "@/lib/reports/data";
import { fmtDateTime, fmtInt } from "@/lib/reports/format";
import { param, periodLabel, periodQuery, qs, resolvePeriod, type SearchParams } from "@/lib/reports/period";

const TYPE_LABEL: Record<string, string> = Object.fromEntries(MOVEMENT_TYPES.map((t) => [t.key, t.label]));

export default async function MiscariPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { supabase, organizationId } = await requireOrgContext();

  const period = resolvePeriod(sp);
  const clientId = param(sp, "client");
  const type = param(sp, "tip");
  const search = param(sp, "cauta");
  const page = Math.max(1, Number.parseInt(param(sp, "pagina"), 10) || 1);
  const filters: MovementFilters = {
    period,
    clientId: clientId || null,
    type: MOVEMENT_TYPES.some((t) => t.key === type) ? type : null,
    search,
  };

  const [clients, { rows, total }] = await Promise.all([
    getClients(supabase, organizationId),
    getMovementsPage(supabase, organizationId, filters, page),
  ]);
  const pages = Math.max(1, Math.ceil(total / MOVEMENTS_PER_PAGE));
  const keep = { client: clientId, tip: type, cauta: search };
  const pageHref = (p: number) =>
    `/rapoarte/miscari${qs({ ...keep, ...periodQuery(period), pagina: p > 1 ? String(p) : "" })}`;

  return (
    <>
      <ReportFilters basePath="/rapoarte/miscari" period={period} keep={keep}>
        <ClientSelect clients={clients} value={clientId} />
        <div className="field">
          <label htmlFor="tip">Tip</label>
          <select id="tip" name="tip" defaultValue={type}>
            <option value="">Toate tipurile</option>
            {MOVEMENT_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cauta">Produs</label>
          <input id="cauta" name="cauta" placeholder="SKU sau nume" defaultValue={search} />
        </div>
      </ReportFilters>

      <div className="page-heading">
        <h2>Miscari stoc</h2>
        <span className="muted">
          {periodLabel(period)} · {fmtInt(total)} miscari
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <History size={28} strokeWidth={1.75} />
          <h2>Nicio miscare</h2>
          <p>Nicio miscare de stoc nu corespunde filtrelor alese.</p>
        </div>
      ) : (
        <div className="table-wrap report-table">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tip</th>
                <th>SKU</th>
                <th>Produs</th>
                <th>Client</th>
                <th>Locatie</th>
                <th className="num">Cantitate</th>
                <th>Referinta</th>
                <th>Utilizator</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="mono small">{fmtDateTime(m.created_at)}</td>
                  <td>{TYPE_LABEL[m.movement_type] ?? m.movement_type}</td>
                  <td className="mono strong">{m.sku}</td>
                  <td>{m.product_name}</td>
                  <td className="muted">{m.client_name}</td>
                  <td className="mono small">{m.location_code ?? "—"}</td>
                  <td className={`num strong ${m.quantity_change > 0 ? "qty-in" : "qty-out"}`}>
                    {m.quantity_change > 0 ? "+" : ""}
                    {fmtInt(m.quantity_change)}
                  </td>
                  <td className="muted">{m.reference_label ?? "—"}</td>
                  <td className="muted small">{m.created_by_email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="pager">
          {page > 1 ? (
            <Link className="btn ghost small" href={pageHref(page - 1)}>
              <ChevronLeft size={14} /> Inapoi
            </Link>
          ) : (
            <span />
          )}
          <span className="muted">
            Pagina {page} din {pages}
          </span>
          {page < pages ? (
            <Link className="btn ghost small" href={pageHref(page + 1)}>
              Inainte <ChevronRight size={14} />
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </>
  );
}
