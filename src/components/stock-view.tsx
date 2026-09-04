"use client";

import { useMemo, useState } from "react";
import { Boxes, MapPin, Search } from "lucide-react";

export type InventoryRow = {
  id: string;
  quantity: number;
  updated_at: string;
  products: {
    sku: string;
    name: string;
    reorder_point: number;
    clients: { name: string } | null;
  } | null;
  locations: {
    code: string;
    warehouses: { name: string } | null;
  } | null;
};

function stockStatus(quantity: number, reorderPoint: number) {
  if (quantity <= 0) return "epuizat";
  if (quantity <= reorderPoint) return "scazut";
  return "ok";
}

const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  scazut: "Scazut",
  epuizat: "Epuizat",
};

export default function StockView({ initialRows }: { initialRows: InventoryRow[] }) {
  const [q, setQ] = useState("");

  const sorted = useMemo(
    () =>
      [...initialRows].sort((a, b) => {
        const skuA = a.products?.sku ?? "";
        const skuB = b.products?.sku ?? "";
        if (skuA !== skuB) return skuA.localeCompare(skuB);
        return (a.locations?.code ?? "").localeCompare(b.locations?.code ?? "");
      }),
    [initialRows]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((r) => {
      const haystack = [
        r.products?.sku,
        r.products?.name,
        r.products?.clients?.name,
        r.locations?.code,
        r.locations?.warehouses?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [sorted, q]);

  if (initialRows.length === 0) {
    return (
      <div className="stack">
        <div className="empty-state">
          <Boxes size={28} strokeWidth={1.75} />
          <h2>Niciun stoc inca</h2>
          <p>Stocul apare aici automat dupa prima receptie de marfa.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="search">
        <Search size={16} />
        <input
          placeholder="Cauta SKU, produs, client sau locatie..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Produs</th>
              <th>Client</th>
              <th>Depozit</th>
              <th>Locatie</th>
              <th className="num">Stoc</th>
              <th className="num">Prag</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const reorderPoint = r.products?.reorder_point ?? 0;
              const status = stockStatus(r.quantity, reorderPoint);
              return (
                <tr key={r.id}>
                  <td className="mono strong">{r.products?.sku ?? "—"}</td>
                  <td>{r.products?.name ?? "—"}</td>
                  <td className="muted">{r.products?.clients?.name ?? "—"}</td>
                  <td className="muted">{r.locations?.warehouses?.name ?? "—"}</td>
                  <td>
                    <span className="loc">
                      <MapPin size={12} /> {r.locations?.code ?? "—"}
                    </span>
                  </td>
                  <td className="num strong">{r.quantity}</td>
                  <td className="num muted">{reorderPoint}</td>
                  <td>
                    <span className={`pill ${status}`}>{STATUS_LABEL[status]}</span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  Niciun rezultat pentru &quot;{q}&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
