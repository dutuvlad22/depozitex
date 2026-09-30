"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, CameraOff, CircleCheck, Minus, PackageCheck, Plus, ShoppingCart } from "lucide-react";
import CourierShippingPanel from "@/components/courier-shipping-panel";
import { createClient } from "@/lib/supabase/client";
import { useBarcodeScanner } from "@/lib/use-barcode-scanner";
import { boxName, findBox, normalizeCode } from "@/lib/cart-codes";

export type PackBox = { box: number; packed: boolean; orderId: string; orderNo: string; clientName: string };
export type PackLine = { id: string; sku: string; name: string; quantity: number; picked: number; packed: number };
export type PackOrder = {
  id: string;
  orderNo: string;
  status: string;
  box: number;
  clientName: string;
  lines: PackLine[];
};

type Feedback = { type: "ok" | "err"; text: string } | null;

export default function PackingStation({
  cartCode,
  cartError,
  waitingCarts,
  boxNames,
  boxes,
  order,
}: {
  cartCode: string | null;
  cartError: string | null;
  waitingCarts: { code: string; left: number }[];
  boxNames: string[]; // denumirile cutiilor caruciorului curent, pe pozitii
  boxes: PackBox[];
  order: PackOrder | null;
}) {
  const router = useRouter();
  const label = (boxNo: number) => boxName(boxNames, boxNo);
  const [boxState, setBoxState] = useState<PackBox[]>(boxes);
  const [lines, setLines] = useState<PackLine[]>(order?.lines ?? []);
  const [status, setStatus] = useState(order?.status ?? "");
  const [feedback, setFeedback] = useState<Feedback>(cartError ? { type: "err", text: cartError } : null);
  const [cartInput, setCartInput] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmPack, setConfirmPack] = useState(false);
  const [packing, setPacking] = useState(false);
  const [cartFree, setCartFree] = useState(false);

  const cartUrl = (code: string, box?: number) =>
    `/ambalare?carucior=${encodeURIComponent(code)}${box ? `&cutie=${box}` : ""}`;

  const scanner = useBarcodeScanner((code) => {
    // cutie de pe caruciorul curent: se deschide comanda din ea
    const box = cartCode ? findBox(code, cartCode, boxNames) : null;
    if (cartCode && box) {
      if (!boxState.some((b) => b.box === box)) {
        setFeedback({ type: "err", text: `${label(box)} e goala pe caruciorul ${cartCode}.` });
        return;
      }
      scanner.stop();
      router.push(cartUrl(cartCode, box));
      return;
    }
    // produs: verificarea comenzii deschise
    if (order && status === "la_ambalare") {
      const line = lines.find((l) => l.sku.toLowerCase() === code.toLowerCase());
      if (!line) {
        setFeedback({ type: "err", text: `${code} NU face parte din comanda ${order.orderNo}!` });
        return;
      }
      if (line.packed >= line.quantity) {
        setFeedback({ type: "err", text: `${code}: toate bucatile sunt deja verificate.` });
        return;
      }
      void changeQty(line, 1, true);
      return;
    }
    // altfel: cod de carucior
    scanner.stop();
    router.push(cartUrl(normalizeCode(code)));
  });

  async function changeQty(line: PackLine, delta: number, viaScan = false) {
    setBusyId(line.id);
    const { data, error } = await createClient().rpc("scan_pack_line", {
      p_order_line_id: line.id,
      p_delta: delta,
    });
    setBusyId(null);
    if (error) {
      setFeedback({ type: "err", text: error.message });
      return;
    }
    const packed = (data as { packed_quantity: number }).packed_quantity;
    setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, packed } : l)));
    if (viaScan) setFeedback({ type: "ok", text: `${line.sku} verificat — ${packed}/${line.quantity}` });
  }

  async function pack() {
    if (!order) return;
    setPacking(true);
    const { data, error } = await createClient().rpc("pack_order", { p_order_id: order.id });
    setPacking(false);
    if (error) {
      setFeedback({ type: "err", text: error.message });
      return;
    }
    // fara router.refresh(): dupa ultima cutie caruciorul se inchide, iar pagina
    // reincarcata n-ar mai gasi comanda — panoul de AWB trebuie sa ramana aici
    scanner.stop();
    setConfirmPack(false);
    setStatus("ambalat");
    setBoxState((prev) => prev.map((b) => (b.orderId === order.id ? { ...b, packed: true } : b)));
    setCartFree(Boolean((data as { cart_free?: boolean }).cart_free));
    setFeedback(null);
  }

  const camera = (
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
    </div>
  );
  const message = feedback && <div className={`auth-msg ${feedback.type}`}>{feedback.text}</div>;

  // ---------- 1. alege caruciorul ----------
  if (!cartCode || cartError) {
    return (
      <div className="picking">
        <div className="picking-queue">
          <ShoppingCart size={30} strokeWidth={1.75} />
          <div className="muted">Scaneaza caruciorul adus de picker.</div>
          <div className="picking-full">{camera}</div>
          <form
            className="picking-manual"
            onSubmit={(e) => {
              e.preventDefault();
              if (cartInput.trim()) router.push(cartUrl(normalizeCode(cartInput)));
            }}
          >
            <input
              className="mono"
              placeholder="sau scrie codul: CAR01"
              value={cartInput}
              onChange={(e) => setCartInput(e.target.value)}
            />
            <button className="btn primary" type="submit" disabled={!cartInput.trim()}>
              Deschide
            </button>
          </form>
          {message}
        </div>
        {waitingCarts.length > 0 && (
          <section className="panel">
            <div className="panel-head">
              <ShoppingCart size={16} /> Carucioare care asteapta ambalarea
            </div>
            <div className="box-grid">
              {waitingCarts.map((c) => (
                <Link key={c.code} href={cartUrl(c.code)} className="box-tile">
                  <span className="mono strong">{c.code}</span>
                  <span className="muted small">{c.left} de ambalat</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // ---------- 2. caruciorul: cutiile ----------
  if (!order) {
    const left = boxState.filter((b) => !b.packed).length;
    return (
      <div className="picking">
        <Link href="/ambalare" className="back-link">
          <ArrowLeft size={14} /> Alt carucior
        </Link>
        <div className="picking-head">
          <div className="mono strong picking-order">{cartCode}</div>
          <div className="picking-progress">
            {boxState.length - left}/{boxState.length} ambalate
          </div>
        </div>
        <div className="muted small">Scaneaza o cutie (sau apas-o) ca sa deschizi comanda din ea.</div>
        {camera}
        {message}
        <div className="box-grid">
          {boxState.map((b) => (
            <Link key={b.box} href={cartUrl(cartCode, b.box)} className={`box-tile ${b.packed ? "done" : ""}`}>
              <span className="mono strong">{label(b.box)}</span>
              <span className="small">{b.orderNo}</span>
              <span className="muted small">{b.packed ? "Ambalata" : b.clientName}</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // ---------- 3. comanda din cutie ----------
  const isPacking = status === "la_ambalare";
  const mismatched = lines.filter((l) => l.packed !== l.picked || l.picked !== l.quantity).length;
  const nextBox = boxState.find((b) => !b.packed && b.box !== order.box);

  return (
    <div className="picking">
      <Link href={cartUrl(cartCode)} className="back-link">
        <ArrowLeft size={14} /> {cartCode} — toate cutiile
      </Link>
      <div className="picking-head">
        <div>
          <div className="mono strong picking-order">
            {label(order.box)} · {order.orderNo}
          </div>
          <div className="muted small">{order.clientName}</div>
        </div>
        <span className={`pill ${isPacking ? "scazut" : "ok"}`}>{isPacking ? "La ambalare" : "Ambalata"}</span>
      </div>

      {isPacking && (
        <>
          <div className="muted small">Scaneaza fiecare produs din cutie inainte sa o inchizi.</div>
          {camera}
        </>
      )}
      {message}

      <div className="picking-list">
        {lines.map((l) => {
          const short = l.picked < l.quantity;
          return (
            <div key={l.id} className={`pick-row pack-row ${l.packed >= l.quantity ? "done" : ""} ${short ? "over" : ""}`}>
              <div className="pick-info">
                <div className="mono strong">{l.sku}</div>
                <div className="muted small">{l.name}</div>
                {short && (
                  <div className="small pack-short">
                    Pickerul a luat {l.picked} din {l.quantity}
                  </div>
                )}
              </div>
              <div className="pick-qty">
                {isPacking && (
                  <button
                    className="pick-btn"
                    aria-label="Scade o bucata"
                    disabled={busyId === l.id || l.packed <= 0}
                    onClick={() => changeQty(l, -1)}
                  >
                    <Minus size={16} />
                  </button>
                )}
                <span className="pick-count">
                  {l.packed}/{l.quantity}
                </span>
                {isPacking && (
                  <button
                    className="pick-btn"
                    aria-label="Adauga manual o bucata"
                    disabled={busyId === l.id || l.packed >= l.quantity}
                    onClick={() => changeQty(l, 1)}
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isPacking ? (
        <div className="picking-finish">
          {mismatched > 0 && confirmPack && (
            <div className="auth-msg err">
              {mismatched} {mismatched === 1 ? "produs nu corespunde" : "produse nu corespund"} cu comanda.
              Poti ambala oricum — diferentele raman vizibile pe comanda.
            </div>
          )}
          {!confirmPack ? (
            <button className="picking-next" onClick={() => (mismatched ? setConfirmPack(true) : pack())} disabled={packing}>
              <PackageCheck size={18} /> {packing ? "Se salveaza..." : "Ambalat"}
            </button>
          ) : (
            <div className="picking-confirm">
              <button className="btn ghost" onClick={() => setConfirmPack(false)} disabled={packing}>
                Inapoi
              </button>
              <button className="btn danger" onClick={pack} disabled={packing}>
                {packing ? "..." : "Ambaleaza oricum"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <CourierShippingPanel orderId={order.id} />
          <div className="picking-finish">
            {cartFree || !nextBox ? (
              <div className="picking-done">
                <CircleCheck size={32} strokeWidth={1.75} />
                <div>Toate cutiile de pe {cartCode} sunt ambalate — caruciorul e liber.</div>
                <Link href="/ambalare" className="btn ghost">
                  Alt carucior
                </Link>
              </div>
            ) : (
              <Link href={cartUrl(cartCode, nextBox.box)} className="picking-next">
                Urmatoarea cutie: {label(nextBox.box)}
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
