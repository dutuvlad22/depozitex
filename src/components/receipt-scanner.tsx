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

export type ReceiptLineRow = {
  id: string;
  quantity: number;
  received_quantity: number;
  products: { sku: string; name: string } | null;
  locations: { code: string } | null;
};

type ScanFeedback = { type: "ok" | "err"; text: string };

function lineState(line: ReceiptLineRow) {
  const diff = line.received_quantity - line.quantity;
  if (diff === 0) return { tone: "ok", label: "OK" };
  if (diff < 0) return { tone: "scazut", label: `Lipsesc ${-diff}` };
  return { tone: "red", label: `+${diff} in plus` };
}

export default function ReceiptScanner({
  receiptId,
  status,
  reference,
  createdAt,
  clientName,
  warehouseName,
  initialLines,
}: {
  receiptId: string;
  status: string;
  reference: string | null;
  createdAt: string;
  clientName: string;
  warehouseName: string;
  initialLines: ReceiptLineRow[];
}) {
  const [lines, setLines] = useState<ReceiptLineRow[]>(initialLines);
  const [localStatus, setLocalStatus] = useState(status);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<ScanFeedback | null>(null);
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const linesRef = useRef<ReceiptLineRow[]>(initialLines);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
    };
  }, []);

  const isDraft = localStatus === "draft";

  async function applyScan(lineId: string, delta: number, scannedCode?: string) {
    setBusyLineId(lineId);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("scan_receipt_line", {
      p_receipt_line_id: lineId,
      p_delta: delta,
    });
    setBusyLineId(null);

    if (error) {
      setScanMessage({ type: "err", text: error.message });
      return;
    }

    const updated = data as unknown as ReceiptLineRow;
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, received_quantity: updated.received_quantity } : l)));

    if (scannedCode) {
      const line = linesRef.current.find((l) => l.id === lineId);
      setScanMessage({
        type: "ok",
        text: `${scannedCode} inregistrat — ${updated.received_quantity}/${line?.quantity ?? "?"} buc.`,
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

    const line = linesRef.current.find(
      (l) => l.products?.sku?.toLowerCase() === code.toLowerCase()
    );

    if (!line) {
      setScanMessage({ type: "err", text: `Cod necunoscut pentru aceasta receptie: ${code}` });
      return;
    }

    void applyScan(line.id, 1, code);
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
    const { error } = await supabase.rpc("finalize_receipt", { p_receipt_id: receiptId });
    setFinalizing(false);

    if (error) {
      setFinalizeError(error.message);
      return;
    }

    stopScanning();
    setConfirmFinalize(false);
    setLocalStatus("confirmat");
  }

  const mismatched = lines.filter((l) => l.received_quantity !== l.quantity);

  return (
    <div className="stack">
      <Link href="/receptie" className="back-link">
        <ArrowLeft size={14} /> Receptie
      </Link>

      <div className="page-heading">
        <h2>{clientName}</h2>
        <span className="muted">{warehouseName}</span>
        <span className={`pill ${localStatus === "confirmat" ? "ok" : "scazut"}`}>
          {localStatus === "confirmat" ? "Confirmat" : "In verificare"}
        </span>
      </div>
      <div className="hint">
        {new Date(createdAt).toLocaleDateString("ro-RO")}
        {reference ? ` · Referinta: ${reference}` : ""}
      </div>

      {isDraft && (
        <div className="panel">
          <div className="panel-head">
            <ScanLine size={16} /> Scaneaza bucatile primite
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

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Produs</th>
              <th>Locatie</th>
              <th>Declarat</th>
              <th>Scanat</th>
              <th>Stare</th>
              {isDraft && <th></th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const state = lineState(l);
              return (
                <tr key={l.id}>
                  <td className="mono strong">{l.products?.sku ?? "—"}</td>
                  <td>{l.products?.name ?? "—"}</td>
                  <td className="muted">{l.locations?.code ?? "—"}</td>
                  <td className="mono">{l.quantity}</td>
                  <td className="mono strong">{l.received_quantity}</td>
                  <td>
                    <span className={`pill ${state.tone}`}>{state.label}</span>
                  </td>
                  {isDraft && (
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          className="icon-btn"
                          title="Scade o bucata"
                          disabled={busyLineId === l.id || l.received_quantity <= 0}
                          onClick={() => applyScan(l.id, -1)}
                        >
                          <Minus size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="Adauga o bucata manual"
                          disabled={busyLineId === l.id}
                          onClick={() => applyScan(l.id, 1)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={isDraft ? 7 : 6} className="empty">
                  Aceasta receptie nu are linii.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isDraft && (
        <div className="panel">
          <div className="panel-head">
            <PackageCheck size={16} /> Finalizare
          </div>

          {mismatched.length > 0 && (
            <div className="auth-msg err" style={{ marginBottom: 12 }}>
              Diferente la {mismatched.length} {mismatched.length === 1 ? "linie" : "linii"} fata de
              cantitatea declarata. Poti finaliza oricum — stocul se actualizeaza cu cantitatile REAL
              scanate.
            </div>
          )}

          {!confirmFinalize ? (
            <button className="btn primary" type="button" onClick={() => setConfirmFinalize(true)}>
              Finalizeaza receptia
            </button>
          ) : (
            <span className="confirm-delete">
              <span className="small muted">Sigur finalizezi? Stocul va fi actualizat.</span>
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
    </div>
  );
}
