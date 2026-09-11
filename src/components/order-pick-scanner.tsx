"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { IScannerControls } from "@zxing/browser";
import {
  ArrowLeft,
  Camera,
  Minus,
  PackageCheck,
  Plus,
  ScanLine,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import CourierShippingPanel from "@/components/courier-shipping-panel";

export type PickLineRow = {
  id: string;
  quantity: number;
  picked_quantity: number;
  locations: { code: string } | null;
};
export type OrderLineWithPicks = {
  id: string;
  quantity: number;
  picked_quantity: number;
  products: { sku: string; name: string } | null;
  order_pick_lines: PickLineRow[];
};

type FlatRow = {
  id: string;
  sku: string;
  name: string;
  locationCode: string;
  quantity: number;
  picked_quantity: number;
};

type ScanFeedback = { type: "ok" | "err"; text: string };

const STATUS_LABEL: Record<string, string> = {
  nou: "Nou",
  de_pregatit: "In pregatire",
  ambalat: "Ambalat",
  expediat: "Expediat",
};
const STATUS_TONE: Record<string, string> = {
  nou: "",
  de_pregatit: "scazut",
  ambalat: "ok",
  expediat: "ok",
};

function flatten(lines: OrderLineWithPicks[]): FlatRow[] {
  return lines.flatMap((l) =>
    l.order_pick_lines.map((p) => ({
      id: p.id,
      sku: l.products?.sku ?? "—",
      name: l.products?.name ?? "—",
      locationCode: p.locations?.code ?? "—",
      quantity: p.quantity,
      picked_quantity: p.picked_quantity,
    }))
  );
}

function rowState(row: FlatRow) {
  const diff = row.picked_quantity - row.quantity;
  if (diff === 0) return { tone: "ok", label: "OK" };
  if (diff < 0) return { tone: "scazut", label: `Lipsesc ${-diff}` };
  return { tone: "red", label: `+${diff} in plus` };
}

export default function OrderPickScanner({
  orderId,
  orderNo,
  status,
  createdAt,
  clientName,
  initialLines,
}: {
  orderId: string;
  orderNo: string;
  status: string;
  createdAt: string;
  clientName: string;
  initialLines: OrderLineWithPicks[];
}) {
  const [lines, setLines] = useState<OrderLineWithPicks[]>(initialLines);
  const [localStatus, setLocalStatus] = useState(status);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<ScanFeedback | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const flatRef = useRef<FlatRow[]>(flatten(initialLines));
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const flatRows = flatten(lines);

  useEffect(() => {
    flatRef.current = flatRows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
    };
  }, []);

  const isPicking = localStatus === "de_pregatit";
  const notAllocated = localStatus === "nou";

  function updatePickLineQty(pickLineId: string, newQty: number) {
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        order_pick_lines: l.order_pick_lines.map((p) =>
          p.id === pickLineId ? { ...p, picked_quantity: newQty } : p
        ),
      }))
    );
  }

  async function applyScan(pickLineId: string, delta: number, scannedCode?: string) {
    setBusyRowId(pickLineId);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("scan_pick_line", {
      p_pick_line_id: pickLineId,
      p_delta: delta,
    });
    setBusyRowId(null);

    if (error) {
      setScanMessage({ type: "err", text: error.message });
      return;
    }

    const updated = data as unknown as PickLineRow;
    updatePickLineQty(pickLineId, updated.picked_quantity);

    if (scannedCode) {
      const row = flatRef.current.find((r) => r.id === pickLineId);
      setScanMessage({
        type: "ok",
        text: `${scannedCode} inregistrat — ${updated.picked_quantity}/${row?.quantity ?? "?"} buc.`,
      });
    }
  }

  function handleDecodedCode(rawCode: string) {
    const code = rawCode.trim();
    if (!code) return;

    const now = Date.now();
    if (code === lastScanRef.current.code && now - lastScanRef.current.at < 1500) {
      return;
    }
    lastScanRef.current = { code, at: now };

    const matches = flatRef.current.filter((r) => r.sku.toLowerCase() === code.toLowerCase());

    if (matches.length === 0) {
      setScanMessage({ type: "err", text: `Cod necunoscut pentru aceasta comanda: ${code}` });
      return;
    }

    const target = matches.find((r) => r.picked_quantity < r.quantity);
    if (!target) {
      setScanMessage({ type: "err", text: `${code} este deja verificat complet.` });
      return;
    }

    void applyScan(target.id, 1, code);
  }

  async function startScanning() {
    setCameraError(null);
    setScanMessage(null);
    setScanning(true);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current ?? undefined,
        (result) => {
          if (result) {
            handleDecodedCode(result.getText());
          }
        }
      );
      controlsRef.current = controls;
    } catch (e) {
      setCameraError(
        e instanceof Error
          ? `Nu am putut porni camera: ${e.message}`
          : "Nu am putut porni camera. Verifica permisiunile browserului."
      );
      setScanning(false);
    }
  }

  function stopScanning() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }

  async function handleFinalize() {
    setFinalizing(true);
    setFinalizeError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("finalize_pick", { p_order_id: orderId });
    setFinalizing(false);

    if (error) {
      setFinalizeError(error.message);
      return;
    }

    stopScanning();
    setConfirmFinalize(false);
    setLocalStatus("ambalat");
  }

  const mismatched = flatRows.filter((r) => r.picked_quantity !== r.quantity);

  return (
    <div className="stack">
      <Link href="/comenzi" className="back-link">
        <ArrowLeft size={14} /> Comenzi
      </Link>

      <div className="page-heading">
        <h2 className="mono">{orderNo}</h2>
        <span className="muted">{clientName}</span>
        <span className={`pill ${STATUS_TONE[localStatus] ?? ""}`}>
          {STATUS_LABEL[localStatus] ?? localStatus}
        </span>
      </div>
      <div className="hint">{new Date(createdAt).toLocaleDateString("ro-RO")}</div>

      {notAllocated && (
        <div className="hint">
          <ScanLine size={14} />
          Comanda nu a fost inca alocata pentru pregatire. Foloseste butonul &bdquo;Preia la
          pick&rdquo; din lista de comenzi.
        </div>
      )}

      {isPicking && (
        <div className="panel">
          <div className="panel-head">
            <ScanLine size={16} /> Scaneaza produsele preluate
          </div>

          {!scanning ? (
            <button className="btn primary" type="button" onClick={startScanning}>
              <Camera size={15} /> Porneste camera
            </button>
          ) : (
            <>
              <video ref={videoRef} className="scan-video" muted playsInline />
              <button className="btn ghost" type="button" onClick={stopScanning} style={{ marginTop: 10 }}>
                Opreste camera
              </button>
            </>
          )}

          {cameraError && <div className="auth-msg err" style={{ marginTop: 10 }}>{cameraError}</div>}
          {scanMessage && (
            <div className={`auth-msg ${scanMessage.type === "err" ? "err" : "ok"}`} style={{ marginTop: 10 }}>
              {scanMessage.text}
            </div>
          )}

          <div className="hint" style={{ marginTop: 10 }}>
            Codul de bare de pe produs trebuie sa fie identic cu SKU-ul din aplicatie. Fara camera la
            indemana? Foloseste butoanele +/- din tabel pentru numarare manuala.
          </div>
        </div>
      )}

      {!notAllocated && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Produs</th>
                <th>Locatie</th>
                <th>Alocat</th>
                <th>Scanat</th>
                <th>Stare</th>
                {isPicking && <th></th>}
              </tr>
            </thead>
            <tbody>
              {flatRows.map((row) => {
                const state = rowState(row);
                return (
                  <tr key={row.id}>
                    <td className="mono strong">{row.sku}</td>
                    <td>{row.name}</td>
                    <td className="muted">{row.locationCode}</td>
                    <td className="mono">{row.quantity}</td>
                    <td className="mono strong">{row.picked_quantity}</td>
                    <td>
                      <span className={`pill ${state.tone}`}>{state.label}</span>
                    </td>
                    {isPicking && (
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Scade o bucata"
                            disabled={busyRowId === row.id || row.picked_quantity <= 0}
                            onClick={() => applyScan(row.id, -1)}
                          >
                            <Minus size={14} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Adauga o bucata manual"
                            disabled={busyRowId === row.id || row.picked_quantity >= row.quantity}
                            onClick={() => applyScan(row.id, 1)}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {flatRows.length === 0 && (
                <tr>
                  <td colSpan={isPicking ? 7 : 6} className="empty">
                    Aceasta comanda nu are linii de pick.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isPicking && (
        <div className="panel">
          <div className="panel-head">
            <PackageCheck size={16} /> Finalizare pregatire
          </div>

          {mismatched.length > 0 && (
            <div className="auth-msg err" style={{ marginBottom: 12 }}>
              Diferente la {mismatched.length} {mismatched.length === 1 ? "linie" : "linii"} fata de
              cantitatea alocata. Poti finaliza oricum — diferentele raman vizibile pe comanda.
            </div>
          )}

          {!confirmFinalize ? (
            <button className="btn primary" type="button" onClick={() => setConfirmFinalize(true)}>
              Finalizeaza pregatirea
            </button>
          ) : (
            <span className="confirm-delete">
              <span className="small muted">Sigur finalizezi pregatirea?</span>
              <button
                className="btn small ghost"
                type="button"
                onClick={() => setConfirmFinalize(false)}
                disabled={finalizing}
              >
                Nu
              </button>
              <button className="btn small primary" type="button" onClick={handleFinalize} disabled={finalizing}>
                {finalizing ? "..." : "Da, finalizeaza"}
              </button>
            </span>
          )}

          {finalizeError && (
            <div className="auth-msg err" style={{ marginTop: 10 }}>
              {finalizeError}
            </div>
          )}
        </div>
      )}

      {(localStatus === "ambalat" || localStatus === "expediat") && (
        <CourierShippingPanel orderId={orderId} />
      )}
    </div>
  );
}
