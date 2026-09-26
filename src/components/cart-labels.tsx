"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { boxLabel } from "@/lib/cart-codes";

function QrCode({ value, size }: { value: string; size: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { BrowserQRCodeSvgWriter } = await import("@zxing/browser");
      if (cancelled || !ref.current) return;
      const svg = new BrowserQRCodeSvgWriter().write(value, size, size);
      ref.current.replaceChildren(svg);
    })();
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return <div ref={ref} style={{ width: size, height: size }} />;
}

/** Etichete de printat: caruciorul + fiecare cutie, cu QR citit de camera telefonului. */
export default function CartLabels({ code, capacity }: { code: string; capacity: number }) {
  const boxes = Array.from({ length: capacity }, (_, i) => boxLabel(i + 1));

  return (
    <div className="stack">
      <div className="labels-toolbar">
        <Link href="/setari/carucioare" className="back-link">
          <ArrowLeft size={14} /> Carucioare
        </Link>
        <button className="btn primary" onClick={() => window.print()}>
          <Printer size={15} /> Printeaza
        </button>
      </div>
      <p className="muted small labels-toolbar">
        Eticheta mare se lipeste pe carucior, iar cele mici pe cutii (sau pe locurile cutiilor de pe
        carucior). Codurile cutiilor se repeta pe fiecare carucior: CUT01 de pe {code} este cutia 1 a
        acestui carucior.
      </p>

      <div className="labels-sheet">
        <div className="label label-cart">
          <QrCode value={code} size={150} />
          <div className="label-text">{code}</div>
          <div className="label-sub">Carucior · {capacity} cutii</div>
        </div>
        {boxes.map((b) => (
          <div key={b} className="label">
            <QrCode value={b} size={96} />
            <div className="label-text">{b}</div>
            <div className="label-sub">{code}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
