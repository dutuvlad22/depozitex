import Link from "next/link";
import { Download } from "lucide-react";
import { PRESETS, periodQuery, qs, type Period } from "@/lib/reports/period";

/**
 * Bara de filtre a unui raport: formular GET (filtrele stau in URL, deci
 * raportul se poate reincarca/trimite ca link), perioade rapide si export.
 * `keep` = filtrele non-perioada, pastrate cand se alege o perioada rapida.
 */
export default function ReportFilters({
  basePath,
  period,
  keep = {},
  children,
}: {
  basePath: string;
  period?: Period;
  keep?: Record<string, string>;
  children?: React.ReactNode;
}) {
  const current = { ...keep, ...(period ? periodQuery(period) : {}) };

  return (
    <div className="report-filters">
      {period && (
        <div className="chips">
          {PRESETS.map((p) => (
            <Link
              key={p.key}
              href={`${basePath}${qs({ ...keep, perioada: p.key })}`}
              className={`chip ${period.preset === p.key ? "active" : ""}`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      )}

      <form className="form-row" method="get" action={basePath}>
        {period && (
          <>
            <div className="field">
              <label htmlFor="de_la">De la</label>
              <input id="de_la" type="date" name="de_la" defaultValue={period.from} required />
            </div>
            <div className="field">
              <label htmlFor="pana_la">Pana la</label>
              <input id="pana_la" type="date" name="pana_la" defaultValue={period.to} required />
            </div>
          </>
        )}
        {children}
        <button className="btn primary" type="submit">
          Aplica
        </button>
        <a className="btn ghost" href={`${basePath}/export${qs(current)}`}>
          <Download size={15} /> Export Excel
        </a>
      </form>
    </div>
  );
}

export function ClientSelect({
  clients,
  value,
}: {
  clients: { id: string; name: string }[];
  value: string;
}) {
  return (
    <div className="field">
      <label htmlFor="client">Client</label>
      <select id="client" name="client" defaultValue={value}>
        <option value="">Toti clientii</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
