import { Boxes } from "lucide-react";
import ReportFilters, { ClientSelect } from "@/components/reports/report-filters";
import { requireOrgContext } from "@/lib/org-context";
import { STOCK_FILTERS, daysSince, getClients, getStock } from "@/lib/reports/data";
import { fmtDateTime, fmtInt } from "@/lib/reports/format";
import { param, type SearchParams } from "@/lib/reports/period";

const STATUS_LABEL: Record<string, string> = { ok: "OK", scazut: "Sub prag", epuizat: "Epuizat" };

export default async function StocReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { supabase, organizationId } = await requireOrgContext();
  const clientId = param(sp, "client");
  const filter = param(sp, "filtru");

  const [clients, rows] = await Promise.all([
    getClients(supabase, organizationId),
    getStock(supabase, organizationId, clientId || null, filter),
  ]);
  const units = rows.reduce((s, r) => s + Number(r.quantity), 0);

  return (
    <>
      <ReportFilters basePath="/rapoarte/stoc" keep={{ client: clientId, filtru: filter }}>
        <ClientSelect clients={clients} value={clientId} />
        <div className="field">
          <label htmlFor="filtru">Afiseaza</label>
          <select id="filtru" name="filtru" defaultValue={filter}>
            {STOCK_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </ReportFilters>

      <div className="page-heading">
        <h2>Stoc la zi</h2>
        <span className="muted">
          {fmtInt(rows.length)} produse · {fmtInt(units)} buc.
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <Boxes size={28} strokeWidth={1.75} />
          <h2>Niciun produs</h2>
          <p>Niciun produs nu corespunde filtrelor alese.</p>
        </div>
      ) : (
        <div className="table-wrap report-table">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>SKU</th>
                <th>Produs</th>
                <th className="num">Stoc</th>
                <th className="num">Prag</th>
                <th>Locatii</th>
                <th>Ultima miscare</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const days = daysSince(r.last_movement_at);
                return (
                  <tr key={r.product_id}>
                    <td className="muted">{r.client_name}</td>
                    <td className="mono strong">{r.sku}</td>
                    <td>{r.product_name}</td>
                    <td className="num strong">{fmtInt(Number(r.quantity))}</td>
                    <td className="num muted">{fmtInt(r.reorder_point)}</td>
                    <td className="mono small">{r.locations || "—"}</td>
                    <td className="muted small">
                      {r.last_movement_at ? (
                        <>
                          {fmtDateTime(r.last_movement_at).slice(0, 10)}
                          <span className="report-age">
                            {" · "}
                            {days === 0 ? "azi" : days === 1 ? "ieri" : `acum ${days} zile`}
                          </span>
                        </>
                      ) : (
                        "niciodata"
                      )}
                    </td>
                    <td>
                      <span className={`pill ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
