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
        const config: Record<string, unknown> = {
          fps: 10,
          rememberLastUsedCamera: true,
        };

        if (Html5QrcodeSupportedFormats?.QR_CODE != null) {
          config.formatsToSupport = [Html5QrcodeSupportedFormats.QR_CODE];
        }

        const minDimension = Math.min(window.innerWidth, window.innerHeight);
        config.qrbox = Math.max(200, Math.floor(minDimension * 0.6));

        await qr.start(
          { facingMode: { exact: "environment" } },
          config,
          (decoded: string) => {
            if (!isMounted) return;
            if (decoded && typeof decoded === 'string') {
              onScan(decoded);
            }
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

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        startedRef.current = false;
        startScanner();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

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
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [onScan, onError]);

  return (
    <div
      id="reader"
      className="w-full max-w-xs rounded-lg bg-gray-800 p-4 shadow"
    />
  );
}
