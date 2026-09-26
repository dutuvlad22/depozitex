"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Printer, ShoppingCart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MAX_CART_CAPACITY, nextCartCode, normalizeCartCode } from "@/lib/cart-codes";

export type CartRow = {
  id: string;
  code: string;
  capacity: number;
  active: boolean;
  // doar tura deschisa (picking / la ambalare), daca exista
  cart_runs: {
    id: string;
    status: "picking" | "la_ambalare";
    started_at: string;
    picker: { email: string | null } | null;
    cart_run_boxes: { packed_at: string | null }[];
  }[];
};

export default function CartsManager({
  organizationId,
  initialCarts,
}: {
  organizationId: string;
  initialCarts: CartRow[];
}) {
  const router = useRouter();
  const [code, setCode] = useState(() => nextCartCode(initialCarts.map((c) => c.code)));
  const [capacity, setCapacity] = useState(String(MAX_CART_CAPACITY));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReleaseId, setConfirmReleaseId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = normalizeCartCode(code);
    if (!/^[A-Z0-9-]{1,20}$/.test(normalized)) {
      setError("Codul poate contine doar litere, cifre si cratima (ex. CAR01).");
      return;
    }
    setBusy(true);
    const { error } = await createClient()
      .from("carts")
      .insert({ organization_id: organizationId, code: normalized, capacity: Number(capacity) });
    setBusy(false);
    if (error) {
      setError(error.code === "23505" ? `Caruciorul ${normalized} exista deja.` : error.message);
      return;
    }
    setCode(nextCartCode([...initialCarts.map((c) => c.code), normalized]));
    router.refresh();
  }

  async function toggleActive(cart: CartRow) {
    setError(null);
    const { error } = await createClient().from("carts").update({ active: !cart.active }).eq("id", cart.id);
    if (error) setError(error.message);
    router.refresh();
  }

  async function release(runId: string) {
    setError(null);
    const { error } = await createClient().rpc("release_cart_run", { p_run_id: runId });
    setConfirmReleaseId(null);
    if (error) setError(error.message);
    router.refresh();
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <ShoppingCart size={16} /> Carucior nou
        </div>
        <form className="form-row" onSubmit={handleCreate}>
          <div className="field">
            <label htmlFor="cart-code">Cod</label>
            <input id="cart-code" className="mono" value={code} onChange={(e) => setCode(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="cart-capacity">Numar de cutii</label>
            <select id="cart-capacity" value={capacity} onChange={(e) => setCapacity(e.target.value)}>
              {Array.from({ length: MAX_CART_CAPACITY }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "cutie" : "cutii"}
                </option>
              ))}
            </select>
          </div>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Se adauga..." : "Adauga carucior"}
          </button>
        </form>
        {error && <div className="auth-msg err">{error}</div>}
      </section>

      <div className="table-wrap report-table">
        <table>
          <thead>
            <tr>
              <th>Carucior</th>
              <th className="num">Cutii</th>
              <th>Stare</th>
              <th>Picker</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {initialCarts.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  Niciun carucior inca. Adauga primul carucior mai sus.
                </td>
              </tr>
            )}
            {initialCarts.map((c) => {
              const run = c.cart_runs[0];
              const boxes = run?.cart_run_boxes ?? [];
              const packed = boxes.filter((b) => b.packed_at).length;
              return (
                <tr key={c.id}>
                  <td className="mono strong">{c.code}</td>
                  <td className="num">{c.capacity}</td>
                  <td>
                    {!c.active ? (
                      <span className="pill epuizat">Inactiv</span>
                    ) : !run ? (
                      <span className="pill ok">Liber</span>
                    ) : run.status === "picking" ? (
                      <span className="pill scazut">
                        In picking · {boxes.length} {boxes.length === 1 ? "comanda" : "comenzi"}
                      </span>
                    ) : (
                      <span className="pill scazut">
                        La ambalare · {packed}/{boxes.length}
                      </span>
                    )}
                  </td>
                  <td className="muted small">
                    {run?.status === "picking" ? (run.picker?.email ?? "eliberat — il preia urmatorul picker") : "—"}
                  </td>
                  <td className="actions">
                    <span className="confirm-delete">
                      {run?.status === "picking" && run.picker &&
                        (confirmReleaseId === run.id ? (
                          <>
                            <button className="btn danger small" onClick={() => release(run.id)}>
                              Elibereaza
                            </button>
                            <button className="btn ghost small" onClick={() => setConfirmReleaseId(null)}>
                              Anuleaza
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn ghost small"
                            title="Pickerul a plecat? Urmatorul picker care scaneaza caruciorul continua de unde a ramas."
                            onClick={() => setConfirmReleaseId(run.id)}
                          >
                            Elibereaza
                          </button>
                        ))}
                      <Link className="btn ghost small" href={`/setari/carucioare/${c.id}/etichete`}>
                        <Printer size={13} /> Etichete
                      </Link>
                      {!run && (
                        <button className="btn ghost small" onClick={() => toggleActive(c)}>
                          {c.active ? "Dezactiveaza" : "Activeaza"}
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
