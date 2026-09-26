import { Users } from "lucide-react";
import ReportFilters from "@/components/reports/report-filters";
import { requireOrgContext } from "@/lib/org-context";
import { getClientActivity, type ClientActivityRow } from "@/lib/reports/data";
import { fmtInt } from "@/lib/reports/format";
import { periodLabel, resolvePeriod, type SearchParams } from "@/lib/reports/period";

const COLUMNS: { key: keyof ClientActivityRow; label: string }[] = [
  { key: "orders_received", label: "Comenzi primite" },
  { key: "orders_shipped", label: "Comenzi expediate" },
  { key: "units_shipped", label: "Buc. expediate" },
  { key: "receipts_count", label: "Receptii" },
  { key: "units_received", label: "Buc. receptionate" },
  { key: "returns_count", label: "Retururi" },
  { key: "units_returned", label: "Buc. returnate" },
  { key: "units_in_stock", label: "Stoc la final (buc.)" },
];

export default async function ActivitatePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { supabase, organizationId } = await requireOrgContext();
  const period = resolvePeriod(sp);
  const rows = await getClientActivity(supabase, organizationId, period);

  const totals = Object.fromEntries(
    COLUMNS.map((c) => [c.key, rows.reduce((s, r) => s + Number(r[c.key]), 0)])
  ) as Record<string, number>;

  return (
    <>
      <ReportFilters basePath="/rapoarte/activitate" period={period} />

      <div className="page-heading">
        <h2>Activitate per client</h2>
        <span className="muted">{periodLabel(period)}</span>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <Users size={28} strokeWidth={1.75} />
          <h2>Niciun client inca</h2>
          <p>Raportul apare dupa ce adaugi clienti.</p>
        </div>
      ) : (
        <div className="table-wrap report-table">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="num">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.client_id}>
                  <td className="strong">{r.client_name}</td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className={`num ${Number(r[c.key]) === 0 ? "muted" : ""}`}>
                      {fmtInt(Number(r[c.key]))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {rows.length > 1 && (
              <tfoot>
                <tr>
                  <td>Total</td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="num">
                      {fmtInt(totals[c.key])}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <p className="report-note">
        Comenzile expediate si bucatile expediate se numara dupa data AWB-ului. Receptiile se
        numara la finalizare, cu cantitatile efectiv scanate. Stocul la final e stocul clientului
        la sfarsitul ultimei zile din perioada.
      </p>
    </>
  );
}
