"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Printer, ShoppingCart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_CART_CAPACITY,
  allBoxNames,
  defaultBoxLabel,
  nextCartCode,
  normalizeCode,
  validateCartNames,
} from "@/lib/cart-codes";

export type CartRow = {
  id: string;
  code: string;
  capacity: number;
  active: boolean;
  box_labels: string[] | null; // null = denumirile implicite CUT01..CUTnn
  // doar tura deschisa (picking / la ambalare), daca exista
  cart_runs: {
    id: string;
    status: "picking" | "la_ambalare";
    started_at: string;
    picker: { email: string | null } | null;
    cart_run_boxes: { packed_at: string | null }[];
  }[];
};

type Draft = { id: string; code: string; names: string[] };

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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = normalizeCode(code);
    const invalid = validateCartNames(normalized, []);
    if (invalid) {
      setError(invalid);
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

  async function setActive(cart: CartRow, active: boolean) {
    setError(null);
    const { error } = await createClient().from("carts").update({ active }).eq("id", cart.id);
    if (error) setError(error.message);
    setDraft(null);
    router.refresh();
  }

  async function release(runId: string) {
    setError(null);
    const { error } = await createClient().rpc("release_cart_run", { p_run_id: runId });
    setConfirmReleaseId(null);
    if (error) setError(error.message);
    router.refresh();
  }

  function startEdit(cart: CartRow) {
    setEditError(null);
    setSavedId(null);
    setDraft({ id: cart.id, code: cart.code, names: allBoxNames(cart.box_labels, cart.capacity) });
  }

  async function saveEdit() {
    if (!draft) return;
    const newCode = normalizeCode(draft.code);
    const names = draft.names.map(normalizeCode);
    const invalid = validateCartNames(newCode, names);
    if (invalid) {
      setEditError(invalid);
      return;
    }
    const isDefault = names.every((n, i) => n === defaultBoxLabel(i + 1));
    setSaving(true);
    setEditError(null);
    const { error } = await createClient()
      .from("carts")
      .update({ code: newCode, box_labels: isDefault ? null : names })
      .eq("id", draft.id);
    setSaving(false);
    if (error) {
      setEditError(error.code === "23505" ? `Exista deja un carucior cu codul ${newCode}.` : error.message);
      return;
    }
    setSavedId(draft.id);
    setDraft(null);
    router.refresh();
  }

  const editing = draft ? initialCarts.find((c) => c.id === draft.id) : null;

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
              <th>Cutii</th>
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
              const names = allBoxNames(c.box_labels, c.capacity);
              return (
                <tr key={c.id} className={draft?.id === c.id ? "row-editing" : ""}>
                  <td className="mono strong">{c.code}</td>
                  <td className="muted small">
                    <span className="strong">{c.capacity}</span> ·{" "}
                    <span className="mono">
                      {names.length > 2 ? `${names[0]} … ${names[names.length - 1]}` : names.join(", ")}
                    </span>
                  </td>
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
                      {!run && !c.active && (
                        <button className="btn primary small" onClick={() => setActive(c, true)}>
                          Activeaza
                        </button>
                      )}
                      {!run && (
                        <button className="btn ghost small" onClick={() => startEdit(c)}>
                          <Pencil size={13} /> Editeaza
                        </button>
                      )}
                      <Link className="btn ghost small" href={`/setari/carucioare/${c.id}/etichete`}>
                        <Printer size={13} /> Etichete
                      </Link>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {savedId && (
        <div className="hint">
          Denumirile au fost salvate. Daca ai schimbat ceva,{" "}
          <Link href={`/setari/carucioare/${savedId}/etichete`} className="strong">
            printeaza din nou etichetele
          </Link>{" "}
          — cele vechi nu mai sunt recunoscute la scanare.
        </div>
      )}

      {draft && editing && (
        <section className="panel">
          <div className="panel-head">
            <Pencil size={16} /> Editeaza {editing.code}
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="edit-code">Codul caruciorului</label>
              <input
                id="edit-code"
                className="mono upper"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
            </div>
          </div>

          <div className="lines-head">Denumirile cutiilor ({editing.capacity})</div>
          <div className="box-name-grid">
            {draft.names.map((name, i) => (
              <label key={i} className="box-name">
                <span className="muted small">Cutia {i + 1}</span>
                <input
                  className="mono upper"
                  value={name}
                  maxLength={20}
                  onChange={(e) =>
                    setDraft({ ...draft, names: draft.names.map((n, j) => (j === i ? e.target.value : n)) })
                  }
                />
              </label>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 10 }}>
            Doar litere, cifre si cratima (ce se poate scana), fara spatii. Doua cutii de pe acelasi carucior nu
            pot avea aceeasi denumire.
          </div>

          {editError && <div className="auth-msg err">{editError}</div>}

          <div className="edit-actions">
            <button className="btn primary" onClick={saveEdit} disabled={saving}>
              {saving ? "Se salveaza..." : "Salveaza"}
            </button>
            <button className="btn ghost" onClick={() => setDraft(null)} disabled={saving}>
              Renunta
            </button>
            <button
              className="btn ghost"
              onClick={() =>
                setDraft({ ...draft, names: draft.names.map((_, i) => defaultBoxLabel(i + 1)) })
              }
              disabled={saving}
            >
              Denumiri implicite (CUT01…)
            </button>
            {editing.active && (
              <button className="btn ghost edit-deactivate" onClick={() => setActive(editing, false)} disabled={saving}>
                Dezactiveaza caruciorul
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
