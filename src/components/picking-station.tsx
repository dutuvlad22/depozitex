"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CameraOff, CircleCheck, Inbox, MapPin, Minus, Plus, ScanBarcode } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useBarcodeScanner } from "@/lib/use-barcode-scanner";

export type PickRow = {
  id: string; // order_pick_lines.id
  sku: string;
  name: string;
  location: string;
  quantity: number;
  picked: number;
};

export type CurrentOrder = {
  id: string;
  orderNo: string;
  clientName: string;
  rows: PickRow[]; // deja ordonate dupa locatie (traseul prin depozit)
};

type Feedback = { type: "ok" | "err"; text: string } | null;

export default function PickingStation({
  organizationId,
  current,
  waiting,
}: {
  organizationId: string;
  current: CurrentOrder | null;
  waiting: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<PickRow[]>(current?.rows ?? []);
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);

  const scanner = useBarcodeScanner((code) => {
    const target =
      rows.find((r) => r.sku.toLowerCase() === code.toLowerCase() && r.picked < r.quantity) ??
      rows.find((r) => r.sku.toLowerCase() === code.toLowerCase());
    if (!target) {
      setFeedback({ type: "err", text: `${code} nu face parte din aceasta comanda.` });
      return;
    }
    if (target.picked >= target.quantity) {
      setFeedback({ type: "err", text: `${code}: ai luat deja toate bucatile.` });
      return;
    }
    void changeQty(target, 1, code);
  });

  async function claimNext() {
    setClaiming(true);
    setMessage(null);
    const { data, error } = await createClient().rpc("claim_next_order", {
      p_organization_id: organizationId,
    });
    setClaiming(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (!data) {
      setMessage(
        waiting > 0
          ? "Comenzile ramase nu au inca tot stocul in depozit. Incearca din nou mai tarziu."
          : "Nu e nicio comanda de pregatit acum."
      );
      return;
    }
    router.refresh();
  }

  async function changeQty(row: PickRow, delta: number, scanned?: string) {
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
    if (scanned) {
      setFeedback({ type: "ok", text: `${scanned} · ${row.location} — ${picked}/${row.quantity}` });
    }
  }

  async function finish() {
    if (!current) return;
    setFinishing(true);
    const { error } = await createClient().rpc("finalize_pick", { p_order_id: current.id });
    setFinishing(false);
    if (error) {
      setFeedback({ type: "err", text: error.message });
      return;
    }
    scanner.stop();
    setFinished(true);
  }

  // ---------- fara comanda: coada ----------
  if (!current || finished) {
    return (
      <div className="picking">
        {finished && current && (
          <div className="picking-done">
            <CircleCheck size={40} strokeWidth={1.75} />
            <div>
              Comanda <span className="mono strong">{current.orderNo}</span> e pregatita.
            </div>
            <div className="muted small">A trecut la Ambalat.</div>
          </div>
        )}
        <div className="picking-queue">
          <Inbox size={30} strokeWidth={1.75} />
          <div className="picking-count">{waiting}</div>
          <div className="muted">{waiting === 1 ? "comanda asteapta" : "comenzi asteapta"} pregatirea</div>
          <button className="picking-next" onClick={claimNext} disabled={claiming}>
            {claiming ? "Se cauta..." : "Urmatoarea comanda"}
          </button>
          {message && <div className="auth-msg err">{message}</div>}
        </div>
      </div>
    );
  }

  // ---------- comanda in lucru ----------
  const total = rows.reduce((s, r) => s + r.quantity, 0);
  const picked = rows.reduce((s, r) => s + Math.min(r.picked, r.quantity), 0);
  const mismatched = rows.filter((r) => r.picked !== r.quantity).length;

  return (
    <div className="picking">
      <div className="picking-head">
        <div>
          <div className="mono strong picking-order">{current.orderNo}</div>
          <div className="muted small">{current.clientName}</div>
        </div>
        <div className="picking-progress">
          {picked}/{total} buc.
        </div>
      </div>
      <div className="picking-bar">
        <div style={{ width: `${total ? (picked / total) * 100 : 0}%` }} />
      </div>

      <div className="picking-scan">
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
        {feedback && <div className={`auth-msg ${feedback.type}`}>{feedback.text}</div>}
      </div>

      <div className="picking-list">
        {rows.map((r) => {
          const done = r.picked === r.quantity;
          const over = r.picked > r.quantity;
          return (
            <div key={r.id} className={`pick-row ${done ? "done" : ""} ${over ? "over" : ""}`}>
              <div className="pick-loc">
                <MapPin size={14} /> {r.location}
              </div>
              <div className="pick-info">
                <div className="mono strong">{r.sku}</div>
                <div className="muted small">{r.name}</div>
              </div>
              <div className="pick-qty">
                <button
                  className="pick-btn"
                  aria-label="Scade o bucata"
                  disabled={busyId === r.id || r.picked <= 0}
                  onClick={() => changeQty(r, -1)}
                >
                  <Minus size={16} />
                </button>
                <span className="pick-count">
                  {r.picked}/{r.quantity}
                </span>
                <button
                  className="pick-btn"
                  aria-label="Adauga o bucata"
                  disabled={busyId === r.id || r.picked >= r.quantity}
                  onClick={() => changeQty(r, 1)}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="picking-finish">
        {mismatched > 0 && confirmFinish && (
          <div className="auth-msg err">
            {mismatched} {mismatched === 1 ? "produs nu are" : "produse nu au"} cantitatea completa. Poti
            finaliza oricum — diferentele raman vizibile pe comanda.
          </div>
        )}
        {!confirmFinish ? (
          <button className="picking-next" onClick={() => (mismatched ? setConfirmFinish(true) : finish())} disabled={finishing}>
            <ScanBarcode size={18} /> {finishing ? "Se finalizeaza..." : "Gata, comanda e pregatita"}
          </button>
        ) : (
          <div className="picking-confirm">
            <button className="btn ghost" onClick={() => setConfirmFinish(false)} disabled={finishing}>
              Inapoi
            </button>
            <button className="btn danger" onClick={finish} disabled={finishing}>
              {finishing ? "..." : "Finalizeaza oricum"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
