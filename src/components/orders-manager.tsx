"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Eye,
  PackageCheck,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  UserRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { boxLabel } from "@/lib/cart-codes";

export type ClientOption = { id: string; name: string };
export type ProductOption = { id: string; sku: string; name: string; client_id: string };
export type OrderRow = {
  id: string;
  order_no: string;
  status: string;
  created_at: string;
  source: string;
  clients: { name: string } | null;
  assignee: { email: string | null } | null;
  order_lines: { id: string; quantity: number; products: { sku: string; name: string } | null }[];
  shipments: { awb: string; courier: string }[];
  // cutiile in care a stat comanda (inclusiv ture de carucior inchise)
  cart_run_boxes: { box_no: number; cart_runs: { status: string; carts: { code: string } | null } | null }[];
};

type LineDraft = { productId: string; quantity: string };

const STATUS_FLOW = ["nou", "de_pregatit", "la_ambalare", "ambalat", "expediat"];
const STATUS_LABEL: Record<string, string> = {
  nou: "Nou",
  de_pregatit: "In picking",
  la_ambalare: "La ambalare",
  ambalat: "Ambalat",
  expediat: "Expediat",
};

function emptyLine(): LineDraft {
  return { productId: "", quantity: "1" };
}

function suggestOrderNo() {
  return `CMD-${Date.now().toString(36).toUpperCase()}`;
}

export default function OrdersManager({
  organizationId,
  clients,
  products,
  initialOrders,
  isAdmin,
}: {
  organizationId: string;
  clients: ClientOption[];
  products: ProductOption[];
  initialOrders: OrderRow[];
  isAdmin: boolean;
}) {
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [orderNo, setOrderNo] = useState(suggestOrderNo);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const clientProducts = products.filter((p) => p.client_id === clientId);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      [
        o.order_no,
        o.clients?.name,
        ...o.order_lines.map((l) => l.products?.sku),
        ...o.order_lines.map((l) => l.products?.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [orders, query]);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clientId) {
      setError("Alege un client.");
      return;
    }
    const trimmedOrderNo = orderNo.trim();
    if (!trimmedOrderNo) {
      setError("Scrie un numar de comanda.");
      return;
    }

    const payloadLines = lines
      .filter((l) => l.productId)
      .map((l) => ({ product_id: l.productId, quantity: Number(l.quantity) }));

    if (payloadLines.length === 0) {
      setError("Adauga cel putin un produs.");
      return;
    }
    if (payloadLines.some((l) => !l.quantity || l.quantity <= 0)) {
      setError("Cantitatea trebuie sa fie un numar pozitiv pentru fiecare linie.");
      return;
    }

    setCreating(true);
    const supabase = createClient();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        organization_id: organizationId,
        client_id: clientId,
        order_no: trimmedOrderNo,
        status: "nou",
      })
      .select("id")
      .single();

    if (orderError || !order) {
      setCreating(false);
      setError(
        orderError?.code === "23505"
          ? `Numarul de comanda "${trimmedOrderNo}" exista deja.`
          : orderError?.message ?? "Eroare necunoscuta."
      );
      return;
    }

    const { error: linesError } = await supabase
      .from("order_lines")
      .insert(payloadLines.map((l) => ({ order_id: order.id, ...l })));

    setCreating(false);

    if (linesError) {
      setError(linesError.message);
      return;
    }

    const clientName = clients.find((c) => c.id === clientId)?.name ?? "—";
    setOrders((prev) => [
      {
        id: order.id as string,
        order_no: trimmedOrderNo,
        status: "nou",
        created_at: new Date().toISOString(),
        source: "manual",
        clients: { name: clientName },
        assignee: null,
        cart_run_boxes: [],
        order_lines: payloadLines.map((l, i) => ({
          id: `local-${i}`,
          quantity: l.quantity,
          products: clientProducts.find((p) => p.id === l.product_id)
            ? {
                sku: clientProducts.find((p) => p.id === l.product_id)!.sku,
                name: clientProducts.find((p) => p.id === l.product_id)!.name,
              }
            : null,
        })),
        shipments: [],
      },
      ...prev,
    ]);

    setOrderNo(suggestOrderNo());
    setLines([emptyLine()]);
  }

  async function handleDelete(order: OrderRow) {
    setError(null);
    setDeletingId(order.id);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("delete_order", { p_order_id: order.id });

    setDeletingId(null);
    setConfirmDeleteId(null);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setOrders((prev) => prev.filter((o) => o.id !== order.id));
  }

  if (clients.length === 0 || products.length === 0) {
    return (
      <div className="stack">
        <div className="hint">
          <ClipboardList size={16} />
          Ai nevoie de cel putin un client si un produs inainte sa poti crea o comanda.
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <ClipboardList size={16} /> Comanda noua
        </div>
        <form onSubmit={handleCreate}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="orderClient">Client</label>
              <select
                id="orderClient"
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setLines([emptyLine()]);
                }}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="orderNo">Numar comanda</label>
              <input
                id="orderNo"
                type="text"
                className="mono"
                value={orderNo}
                onChange={(e) => setOrderNo(e.target.value)}
              />
            </div>
          </div>

          <div className="lines-head">Produse comandate</div>

          {clientProducts.length === 0 ? (
            <div className="auth-msg err">Clientul ales nu are niciun produs.</div>
          ) : (
            <>
              {lines.map((line, i) => (
                <div key={i} className="line-edit" style={{ gridTemplateColumns: "1fr 90px auto" }}>
                  <select
                    value={line.productId}
                    onChange={(e) => updateLine(i, { productId: e.target.value })}
                  >
                    <option value="">Alege produs...</option>
                    {clientProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    className="mono"
                    placeholder="Cant."
                    value={line.quantity}
                    onChange={(e) => updateLine(i, { quantity: e.target.value })}
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removeLine(i)}
                      title="Sterge linia"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn ghost small" onClick={addLine}>
                <Plus size={14} /> Adauga produs
              </button>
            </>
          )}

          {error && <div className="auth-msg err">{error}</div>}

          <button className="btn primary" type="submit" disabled={creating} style={{ marginTop: 16 }}>
            {creating ? "Se creeaza..." : "Creeaza comanda"}
          </button>
        </form>
      </div>

      {orders.length > 0 && (
        <div className="search">
          <Search size={15} />
          <input
            type="text"
            placeholder="Cauta dupa numar comanda, client sau produs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {orders.length > 0 && filteredOrders.length === 0 && (
        <div className="empty">Nicio comanda nu corespunde cautarii.</div>
      )}

      <div className="board">
        {STATUS_FLOW.map((status) => {
          const col = filteredOrders.filter((o) => o.status === status);
          return (
            <div key={status} className="col">
              <div className="col-head">
                <span>{STATUS_LABEL[status]}</span>
                <span className="col-count">{col.length}</span>
              </div>
              {col.map((o) => {
                const shipment = o.shipments[0];
                const box = o.cart_run_boxes.find((b) => b.cart_runs && b.cart_runs.status !== "inchis");
                return (
                  <div key={o.id} className="order-card">
                    <div className="order-top">
                      <span className="mono strong">{o.order_no}</span>
                      {o.source === "api" && (
                        <span className="source-tag" title="Comanda primita automat prin API">
                          API
                        </span>
                      )}
                      <span className="muted small">
                        {new Date(o.created_at).toLocaleDateString("ro-RO")}
                      </span>
                      {isAdmin && confirmDeleteId !== o.id && (
                        <button
                          className="icon-btn"
                          onClick={() => setConfirmDeleteId(o.id)}
                          title="Sterge comanda"
                          style={{ marginLeft: "auto" }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="order-client">{o.clients?.name ?? "—"}</div>
                    <div className="order-lines">
                      {o.order_lines.map((l) => (
                        <div key={l.id} className="line">
                          <span className="mono small">{l.products?.sku ?? "—"}</span>
                          <span className="qty">×{l.quantity}</span>
                        </div>
                      ))}
                    </div>
                    {shipment && (
                      <div className="order-awb">
                        <Truck size={12} /> {shipment.awb} · {shipment.courier}
                      </div>
                    )}
                    {box && (
                      <div className="order-picker">
                        <ShoppingCart size={12} />
                        <span className="order-picker-name mono">
                          {box.cart_runs?.carts?.code} · {boxLabel(box.box_no)}
                        </span>
                      </div>
                    )}
                    {status === "de_pregatit" && o.assignee?.email && (
                      <div className="order-picker">
                        <UserRound size={12} />
                        <span className="order-picker-name">{o.assignee.email}</span>
                      </div>
                    )}
                    {confirmDeleteId === o.id ? (
                      <span className="confirm-delete" style={{ marginTop: 9 }}>
                        <span className="small muted">Stergi comanda?</span>
                        <button
                          className="btn small ghost"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={deletingId === o.id}
                        >
                          Nu
                        </button>
                        <button
                          className="btn small danger"
                          onClick={() => handleDelete(o)}
                          disabled={deletingId === o.id}
                        >
                          {deletingId === o.id ? "..." : "Da, sterge"}
                        </button>
                      </span>
                    ) : status === "nou" ? (
                      <div className="order-hint">Asteapta un carucior</div>
                    ) : status === "la_ambalare" && box?.cart_runs?.carts ? (
                      <Link
                        href={`/ambalare?carucior=${box.cart_runs.carts.code}&cutie=${box.box_no}`}
                        className="btn small ghost full"
                      >
                        <PackageCheck size={14} /> Ambaleaza
                      </Link>
                    ) : status === "ambalat" ? (
                      <Link href={`/comenzi/${o.id}`} className="btn small ghost full">
                        <Truck size={14} /> Genereaza AWB
                      </Link>
                    ) : (
                      <Link href={`/comenzi/${o.id}`} className="btn small ghost full">
                        <Eye size={14} /> Detalii
                      </Link>
                    )}
                  </div>
                );
              })}
              {col.length === 0 && <div className="col-empty">—</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
