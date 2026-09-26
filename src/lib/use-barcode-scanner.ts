"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

/**
 * Scanare coduri de bare cu camera telefonului (camera din spate).
 * `onCode` primeste fiecare cod citit; acelasi cod citit de mai multe ori
 * in 1,5 secunde (camera tinuta pe acelasi produs) se ignora.
 */
export function useBarcodeScanner(onCode: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastRef = useRef({ code: "", at: 0 });
  const onCodeRef = useRef(onCode);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setError(null);
    setScanning(true);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      controlsRef.current = await new BrowserMultiFormatReader().decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current ?? undefined,
        (result) => {
          const code = result?.getText().trim();
          if (!code) return;
          const now = Date.now();
          if (code === lastRef.current.code && now - lastRef.current.at < 1500) return;
          lastRef.current = { code, at: now };
          onCodeRef.current(code);
        }
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? `Nu am putut porni camera: ${e.message}`
          : "Nu am putut porni camera. Verifica permisiunile browserului."
      );
      setScanning(false);
    }
  }, []);

  return { videoRef, scanning, error, start, stop };
}
