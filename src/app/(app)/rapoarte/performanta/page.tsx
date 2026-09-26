import Link from "next/link";
import { ClipboardList, Clock, Gauge, Timer, Truck } from "lucide-react";
import ReportFilters from "@/components/reports/report-filters";
import { requireOrgContext } from "@/lib/org-context";
import { getOpenOrders, getPerformance, hoursSince } from "@/lib/reports/data";
import { fmtDateTime, fmtHours, fmtInt } from "@/lib/reports/format";
import { formatDay, periodLabel, resolvePeriod, type SearchParams } from "@/lib/reports/period";

const ORDER_STATUS: Record<string, string> = {
  nou: "Nou",
  de_pregatit: "In picking",
  la_ambalare: "La ambalare",
  ambalat: "Ambalat",
};

export default async function PerformantaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { supabase, organizationId } = await requireOrgContext();
  const period = resolvePeriod(sp);

  const [{ days, summary }, openOrders] = await Promise.all([
    getPerformance(supabase, organizationId, period),
    getOpenOrders(supabase, organizationId),
  ]);

  const cards = [
    { label: "Comenzi primite", val: fmtInt(summary?.orders_received), icon: ClipboardList, tone: "" },
    { label: "Comenzi expediate", val: fmtInt(summary?.orders_shipped), icon: Truck, tone: "green" },
    { label: "Timp median pana la expediere", val: fmtHours(summary?.median_hours), icon: Timer, tone: "" },
    { label: "90% expediate in maxim", val: fmtHours(summary?.p90_hours), icon: Gauge, tone: "" },
    {
      label: "Expediate in 24h",
      val: summary?.shipped_within_24h === null || summary?.shipped_within_24h === undefined
        ? "—"
        : `${summary.shipped_within_24h}%`,
      icon: Clock,
      tone: "amber",
    },
  ];
  const activeDays = days.filter((d) => d.orders_received > 0 || d.orders_shipped > 0);

  return (
    <>
      <ReportFilters basePath="/rapoarte/performanta" period={period} />

      <div className="page-heading">
        <h2>Performanta operationala</h2>
        <span className="muted">{periodLabel(period)}</span>
      </div>

      <div className="kpi-grid report-kpis">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className={`kpi ${c.tone}`}>
              <div className="kpi-icon">
                <Icon size={18} />
              </div>
              <div className="kpi-val">{c.val}</div>
              <div className="kpi-label">{c.label}</div>
            </div>
          );
        })}
      </div>

      <div className="two-col report-two-col">
        <section className="panel">
          <div className="panel-head">
            <Truck size={16} /> Pe zile
          </div>
          {activeDays.length === 0 ? (
            <div className="empty">Nicio comanda primita sau expediata in perioada aleasa.</div>
          ) : (
            <table className="compact">
              <thead>
                <tr>
                  <th>Ziua</th>
                  <th className="num">Primite</th>
                  <th className="num">Expediate</th>
                  <th className="num">Buc.</th>
                  <th className="num">Timp mediu</th>
                </tr>
              </thead>
              <tbody>
                {activeDays.map((d) => (
                  <tr key={d.day}>
                    <td className="mono small">{formatDay(d.day)}</td>
                    <td className="num">{fmtInt(d.orders_received)}</td>
                    <td className="num">{fmtInt(d.orders_shipped)}</td>
                    <td className="num muted">{fmtInt(d.units_shipped)}</td>
                    <td className="num muted">{fmtHours(d.avg_hours_to_ship)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <Clock size={16} /> Comenzi neexpediate ({fmtInt(openOrders.length)})
          </div>
          {openOrders.length === 0 ? (
            <div className="empty">Nicio comanda in asteptare.</div>
          ) : (
            <table className="compact">
              <thead>
                <tr>
                  <th>Comanda</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th className="num">Asteapta de</th>
                </tr>
              </thead>
              <tbody>
                {openOrders.map((o) => {
                  const h = hoursSince(o.created_at);
                  const tone = h >= 48 ? "epuizat" : h >= 24 ? "scazut" : "ok";
                  return (
                    <tr key={o.id}>
                      <td className="mono strong">
                        <Link href={`/comenzi/${o.id}`} title={fmtDateTime(o.created_at)}>
                          {o.order_no}
                        </Link>
                      </td>
                      <td className="muted">{o.clients?.name ?? "—"}</td>
                      <td className="muted small">{ORDER_STATUS[o.status] ?? o.status}</td>
                      <td className="num">
                        <span className={`pill ${tone}`}>{fmtHours(h)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <p className="report-note">
        Timpul pana la expediere se masoara de la crearea comenzii pana la generarea AWB-ului.
        Lista de comenzi neexpediate arata situatia de acum, indiferent de perioada aleasa.
      </p>
    </>
  );
}
