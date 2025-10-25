"use client";

import { useEffect, useRef } from "react";

export type QRScannerProps = {
  onScan: (decodedText: string) => void;
  onError?: (error: unknown) => void;
};

export default function QRScanner({ onScan, onError }: QRScannerProps) {
  const startedRef = useRef(false);
  const runningRef = useRef(false);

  useEffect(() => {
    let qr: any;
    let isMounted = true;

    const startScanner = async () => {
      if (startedRef.current) return;
      if (typeof window === "undefined") return;
      if (!navigator?.mediaDevices?.getUserMedia) {
        onError?.(
          new Error(
            "Браузер не поддерживает камеру или соединение не защищено (нужен HTTPS)."
          )
        );
        return;
      }

      startedRef.current = true;
      try {
        const mod = await import("html5-qrcode");
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = mod as unknown as {
          Html5Qrcode: new (elementId: string) => any;
          Html5QrcodeSupportedFormats?: Record<string, number>;
        };

        if (!Html5Qrcode) {
          throw new Error("html5-qrcode не удалось загрузить. Обновите страницу.");
        }

        qr = new Html5Qrcode("reader");
        await qr.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: 240,
            formatsToSupport: Html5QrcodeSupportedFormats
              ? [Html5QrcodeSupportedFormats.QR_CODE]
              : undefined,
          },
          (decoded: string) => {
            if (!isMounted) return;
            onScan(decoded);
          },
          (err: unknown) => {
            if (!isMounted) return;
            const message = err instanceof Error ? err.message : String(err);
            if (
              message.includes("QR code parse error") ||
              message.includes("NoMultiFormatReaders") ||
              message.includes("NotFoundException")
            ) {
              return;
            }
            onError?.(new Error(message));
          }
        );
        runningRef.current = true;
      } catch (error) {
        startedRef.current = false;
        onError?.(error);
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      startedRef.current = false;
      if (!qr || !runningRef.current) return;

      runningRef.current = false;
      try {
        const maybePromise = qr.stop();
        Promise.resolve(maybePromise)
          .catch(() => undefined)
          .finally(() => {
            try {
              qr.clear();
            } catch {
              /* ignore */
            }
          });
      } catch {
        try {
          qr.clear();
        } catch {
          /* ignore */
        }
      }
    };
  }, [onScan, onError]);

  return (
    <div
      id="reader"
      className="w-full max-w-xs rounded-lg bg-gray-800 p-4 shadow"
    />
  );
}
