"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CameraOff, CircleCheck, MapPin, Minus, Plus, ShoppingCart, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useBarcodeScanner } from "@/lib/use-barcode-scanner";
import { boxLabel, normalizeCartCode, parseBoxCode } from "@/lib/cart-codes";

export type PickRow = {
  id: string; // order_pick_lines.id
  box: number;
  orderNo: string;
  sku: string;
  name: string;
  location: string;
  quantity: number;
  picked: number;
};

export type CartRun = {
  id: string;
  cartCode: string;
  boxCount: number;
  rows: PickRow[]; // ordonate: locatie, produs, cutie
};

type Feedback = { type: "ok" | "err"; text: string } | null;

export default function PickingStation({
  organizationId,
  run,
  waiting,
}: {
  organizationId: string;
  run: CartRun | null;
  waiting: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<PickRow[]>(run?.rows ?? []);
  const [cartInput, setCartInput] = useState("");
  const [starting, setStarting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  // produsul scanat care asteapta scanarea cutiei in care a fost pus
  const [pending, setPending] = useState<PickRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);

  const scanner = useBarcodeScanner((code) => (run ? handleScanInRun(code) : startRun(code)));

  // ---------- pornire carucior ----------
  async function startRun(code: string) {
    const cart = normalizeCartCode(code);
    if (!cart) return;
    if (parseBoxCode(cart)) {
      setFeedback({ type: "err", text: `${cart} e o cutie. Scaneaza eticheta caruciorului.` });
      return;
    }
    setStarting(true);
    setFeedback(null);
    const { data, error } = await createClient().rpc("start_cart_run", {
      p_organization_id: organizationId,
      p_cart_code: cart,
    });
    setStarting(false);
    if (error) {
      setFeedback({ type: "err", text: error.message });
      return;
    }
    if (!data) {
      setFeedback({
        type: "err",
        text:
          waiting > 0
            ? "Comenzile noi nu au inca tot stocul in depozit. Incearca mai tarziu."
            : "Nu e nicio comanda de pregatit acum.",
      });
      return;
    }
    scanner.stop();
    router.refresh();
  }

  // ---------- scanare in timpul picking-ului ----------
  function handleScanInRun(code: string) {
    const boxCode = parseBoxCode(code);
    if (boxCode) {
      if (boxCode.cart && boxCode.cart !== run?.cartCode) {
        setFeedback({ type: "err", text: `Cutia ${code} nu e de pe caruciorul ${run?.cartCode}.` });
        return;
      }
      if (!pending) {
        setFeedback({ type: "err", text: "Scaneaza intai produsul, apoi cutia in care il pui." });
        return;
      }
      if (boxCode.box !== pending.box) {
        setFeedback({
          type: "err",
          text: `Cutie gresita (${boxLabel(boxCode.box)})! Pune produsul in ${boxLabel(pending.box)}.`,
        });
        return;
      }
      const target = pending;
      setPending(null);
      void changeQty(target, 1, true);
      return;
    }

    // cod de produs: prima bucata inca neluata, in ordinea traseului
    const matching = rows.filter((r) => r.sku.toLowerCase() === code.toLowerCase());
    if (matching.length === 0) {
      setFeedback({ type: "err", text: `${code} nu e in comenzile de pe acest carucior.` });
      return;
    }
    const target = matching.find((r) => r.picked < r.quantity);
    if (!target) {
      setFeedback({ type: "err", text: `${code}: ai luat deja toate bucatile.` });
      return;
    }
    setPending(target);
    setFeedback(null);
  }

  async function changeQty(row: PickRow, delta: number, viaScan = false) {
    setBusyId(row.id);
    const { data, error } = await createClient().rpc("scan_pick_line", {
      p_pick_line_id: row.id,
      p_delta: delta,
    });
    setBusyId(null);
    if (error) {
      setFeedback({ type: "err", text: error.message });
      return;
    }
    const picked = (data as { picked_quantity: number }).picked_quantity;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, picked } : r)));
    if (viaScan) {
      setFeedback({ type: "ok", text: `${row.sku} in ${boxLabel(row.box)} — ${picked}/${row.quantity}` });
    }
  }

  async function finish() {
    if (!run) return;
    setFinishing(true);
    const { error } = await createClient().rpc("finish_cart_run", { p_run_id: run.id });
    setFinishing(false);
    if (error) {
      setFeedback({ type: "err", text: error.message });
      return;
    }
    scanner.stop();
    setFinished(true);
  }

  // produsele grupate pe locatie + SKU (un singur drum la raft pentru toate cutiile)
  const groups = useMemo(() => {
    const out: { key: string; location: string; sku: string; name: string; rows: PickRow[] }[] = [];
    for (const r of rows) {
      const key = `${r.location}|${r.sku}`;
      const last = out[out.length - 1];
      if (last?.key === key) last.rows.push(r);
      else out.push({ key, location: r.location, sku: r.sku, name: r.name, rows: [r] });
    }
    return out;
  }, [rows]);

  const cameraControls = (
    <>
      {scanner.scanning ? (
        <>
          <video ref={scanner.videoRef} className="scan-video" muted playsInline />
          <button className="btn ghost" onClick={scanner.stop}>
            <CameraOff size={15} /> Opreste camera
          </button>
        </>
      ) : (
        <button className="btn primary picking-camera" onClick={scanner.start}>
          <Camera size={17} /> Scaneaza cu camera
        </button>
      )}
      {scanner.error && <div className="auth-msg err">{scanner.error}</div>}
    </>
  );

  // ---------- fara carucior / carucior terminat ----------
  if (!run || finished) {
    return (
      <div className="picking">
        {finished && run && (
          <div className="picking-done">
            <CircleCheck size={40} strokeWidth={1.75} />
            <div>
              Caruciorul <span className="mono strong">{run.cartCode}</span> e gata.
            </div>
            <div className="muted small">Du-l la statia de ambalare.</div>
          </div>
        )}
        <div className="picking-queue">
          <ShoppingCart size={30} strokeWidth={1.75} />
          <div className="picking-count">{waiting}</div>
          <div className="muted">{waiting === 1 ? "comanda asteapta" : "comenzi asteapta"} pregatirea</div>
          <div className="muted small">Scaneaza eticheta caruciorului ca sa primesti comenzile.</div>
          <div className="picking-scan picking-full">{cameraControls}</div>
          <form
            className="picking-manual"
            onSubmit={(e) => {
              e.preventDefault();
              void startRun(cartInput);
            }}
          >
            <input
              className="mono"
              placeholder="sau scrie codul: CAR01"
              value={cartInput}
              onChange={(e) => setCartInput(e.target.value)}
            />
            <button className="btn primary" type="submit" disabled={starting || !cartInput.trim()}>
              {starting ? "..." : "Incepe"}
            </button>
          </form>
          {feedback && <div className={`auth-msg ${feedback.type}`}>{feedback.text}</div>}
        </div>
      </div>
    );
  }

  // ---------- carucior in lucru ----------
  const total = rows.reduce((s, r) => s + r.quantity, 0);
  const picked = rows.reduce((s, r) => s + Math.min(r.picked, r.quantity), 0);
  const incomplete = rows.filter((r) => r.picked < r.quantity).length;

  return (
    <div className="picking">
      <div className="picking-head">
        <div>
          <div className="mono strong picking-order">{run.cartCode}</div>
          <div className="muted small">
            {run.boxCount} {run.boxCount === 1 ? "comanda" : "comenzi"} ·{" "}
            {Array.from({ length: run.boxCount }, (_, i) => boxLabel(i + 1)).join(" ")}
          </div>
        </div>
        <div className="picking-progress">
          {picked}/{total} buc.
        </div>
      </div>
      <div className="picking-bar">
        <div style={{ width: `${total ? (picked / total) * 100 : 0}%` }} />
      </div>

      <div className="picking-scan">{cameraControls}</div>

      {pending ? (
        <div className="put-box">
          <div className="muted small">
            {pending.sku} · {pending.name}
          </div>
          <div className="put-box-label">PUNE IN {boxLabel(pending.box)}</div>
          <div className="small">Scaneaza eticheta cutiei ca sa confirmi.</div>
          <button className="btn ghost small" onClick={() => setPending(null)}>
            <X size={13} /> Anuleaza
          </button>
        </div>
      ) : (
        <div className="put-box idle">Scaneaza un produs de la raft</div>
      )}
      {feedback && <div className={`auth-msg ${feedback.type}`}>{feedback.text}</div>}

      <div className="picking-list">
        {groups.map((g) => {
          const gPicked = g.rows.reduce((s, r) => s + r.picked, 0);
          const gTotal = g.rows.reduce((s, r) => s + r.quantity, 0);
          return (
            <div key={g.key} className={`pick-row pick-group ${gPicked >= gTotal ? "done" : ""}`}>
              <div className="pick-loc">
                <MapPin size={14} /> {g.location}
              </div>
              <div className="pick-info">
                <div className="mono strong">
                  {g.sku} <span className="muted">· ia {gTotal}</span>
                </div>
                <div className="muted small">{g.name}</div>
                <div className="pick-boxes">
                  {g.rows.map((r) => (
                    <div key={r.id} className={`pick-box ${r.picked >= r.quantity ? "done" : ""} ${pending?.id === r.id ? "active" : ""}`}>
                      <span className="mono strong">{boxLabel(r.box)}</span>
                      <button
                        className="pick-btn small"
                        aria-label={`Scade o bucata din ${boxLabel(r.box)}`}
                        disabled={busyId === r.id || r.picked <= 0}
                        onClick={() => changeQty(r, -1)}
                      >
                        <Minus size={14} />
                      </button>
                      <span className="pick-count">
                        {r.picked}/{r.quantity}
                      </span>
                      <button
                        className="pick-btn small"
                        aria-label={`Adauga manual o bucata in ${boxLabel(r.box)}`}
                        disabled={busyId === r.id || r.picked >= r.quantity}
                        onClick={() => changeQty(r, 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="picking-finish">
        {incomplete > 0 && confirmFinish && (
          <div className="auth-msg err">
            Mai ai {incomplete} {incomplete === 1 ? "pozitie incompleta" : "pozitii incomplete"}. Poti trimite
            caruciorul oricum — lipsurile raman vizibile la ambalare.
          </div>
        )}
        {!confirmFinish ? (
          <button
            className="picking-next"
            onClick={() => (incomplete ? setConfirmFinish(true) : finish())}
            disabled={finishing}
          >
            <ShoppingCart size={18} /> {finishing ? "Se trimite..." : "Carucior gata — la ambalare"}
          </button>
        ) : (
          <div className="picking-confirm">
            <button className="btn ghost" onClick={() => setConfirmFinish(false)} disabled={finishing}>
              Inapoi
            </button>
            <button className="btn danger" onClick={finish} disabled={finishing}>
              {finishing ? "..." : "Trimite oricum"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
