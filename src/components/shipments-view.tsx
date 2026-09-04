import { Truck } from "lucide-react";

export type ShipmentRow = {
  id: string;
  awb: string;
  courier: string;
  status: string;
  shipped_at: string | null;
  orders: { order_no: string; clients: { name: string } | null } | null;
};

const STATUS_LABEL: Record<string, string> = {
  generat: "Generat",
  expediat: "Expediat",
  livrat: "Livrat",
  retur: "Retur",
};
const STATUS_PILL: Record<string, string> = {
  generat: "",
  expediat: "ok",
  livrat: "ok",
  retur: "red",
};

export default function ShipmentsView({ shipments }: { shipments: ShipmentRow[] }) {
  if (shipments.length === 0) {
    return (
      <div className="stack">
        <div className="hint">
          <Truck size={16} />
          AWB-urile sunt generate automat la ultimul pas din Comenzi (&quot;Genereaza AWB&quot;). Aici vezi toate
          expedierile.
        </div>
        <div className="empty-state">
          <Truck size={28} strokeWidth={1.75} />
          <h2>Nicio expediere inca</h2>
          <p>Avanseaza o comanda pana la statusul Expediat pentru a genera primul AWB.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="hint">
        <Truck size={16} />
        AWB-urile sunt generate automat la ultimul pas din Comenzi. Aici vezi toate expedierile.
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>AWB</th>
              <th>Comanda</th>
              <th>Client</th>
              <th>Curier</th>
              <th>Data</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map((s) => (
              <tr key={s.id}>
                <td className="mono strong">{s.awb}</td>
                <td className="mono">{s.orders?.order_no ?? "—"}</td>
                <td>{s.orders?.clients?.name ?? "—"}</td>
                <td>{s.courier}</td>
                <td className="muted">
                  {s.shipped_at ? new Date(s.shipped_at).toLocaleDateString("ro-RO") : "—"}
                </td>
                <td>
                  <span className={`pill ${STATUS_PILL[s.status] ?? ""}`}>
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
