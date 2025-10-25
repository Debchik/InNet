"use client";

import { useEffect, useRef } from "react";

export type QRScannerProps = {
  onScan: (decodedText: string) => void;
  onError?: (error: unknown) => void;
};

export default function QRScanner({ onScan, onError }: QRScannerProps) {
  const startedRef = useRef(false);
  const runningRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let qr: any;
    let isMounted = true;

    const startScanner = async () => {
      if (startedRef.current) return;
      if (typeof window === "undefined") return;
      if (!navigator?.mediaDevices?.getUserMedia) {
        onErrorRef.current?.(
          new Error(
            "Браузер не поддерживает камеру или соединение не защищено (нужен HTTPS)."
          )
        );
        return;
      }

      startedRef.current = true;
      try {
        const mod = await import("html5-qrcode");
        const { Html5Qrcode, Html5QrcodeSupportedFormats } =
          mod as unknown as {
            Html5Qrcode: any;
            Html5QrcodeSupportedFormats?: Record<string, number>;
            Html5QrcodeScanType?: Record<string, number>;
          };

        if (!Html5Qrcode) {
          throw new Error("html5-qrcode не удалось загрузить. Обновите страницу.");
        }

        qr = new Html5Qrcode("reader");
        const config: Record<string, unknown> = {
          fps: 10,
          rememberLastUsedCamera: true,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        };

        if (Html5QrcodeSupportedFormats?.QR_CODE != null) {
          config.formatsToSupport = [Html5QrcodeSupportedFormats.QR_CODE];
        }

        const minDimension = Math.min(window.innerWidth, window.innerHeight);
        config.qrbox = Math.max(200, Math.floor(minDimension * 0.6));

        const successHandler = (decoded: string) => {
          if (!isMounted) return;
          if (decoded && typeof decoded === "string") {
            onScanRef.current?.(decoded.trim());
          }
        };

        const errorHandler = (err: unknown) => {
          if (!isMounted) return;
          const message = err instanceof Error ? err.message : String(err);
          if (
            message.includes("QR code parse error") ||
            message.includes("NoMultiFormatReaders") ||
            message.includes("NotFoundException")
          ) {
            return;
          }
          onErrorRef.current?.(new Error(message));
        };

        let lastStartError: unknown = null;

        const attemptStart = async (constraint: MediaTrackConstraints | string) => {
          try {
            await qr.start(constraint, config, successHandler, errorHandler);
            runningRef.current = true;
            return true;
          } catch (err) {
            lastStartError = err;
            return false;
          }
        };

        const tryCameraStart = async () => {
          const candidates: Array<MediaTrackConstraints | string> = [
            { facingMode: { ideal: "environment" } },
            { facingMode: "environment" },
            { facingMode: { exact: "environment" } },
          ];

          for (const candidate of candidates) {
            const started = await attemptStart(candidate);
            if (started) {
              return true;
            }
          }

          if (typeof Html5Qrcode.getCameras === "function") {
            try {
              const cameras = await Html5Qrcode.getCameras();
              if (Array.isArray(cameras) && cameras.length > 0) {
                const preferred =
                  cameras.find((camera) =>
                    /back|rear|environment/i.test(camera.label ?? "")
                  ) ?? cameras[0];
                if (preferred.id) {
                  const started = await attemptStart(preferred.id);
                  if (started) {
                    return true;
                  }
                }
              }
            } catch {
              /* ignore and fallthrough */
            }
          }

          return false;
        };

        const started = await tryCameraStart();
        if (!started) {
          if (lastStartError instanceof Error) {
            throw lastStartError;
          }
          throw new Error(
            "Не удалось запустить камеру. Проверьте разрешения и попробуйте снова."
          );
        }
      } catch (error) {
        startedRef.current = false;
        onErrorRef.current?.(
          error instanceof Error
            ? error
            : new Error("Не удалось запустить сканер QR-кодов.")
        );
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
      document.removeEventListener("visibilitychange", handleVisibility);
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
  }, []);

  return (
    <div
      id="reader"
      className="w-full max-w-xs rounded-lg bg-gray-800 p-4 shadow"
    />
  );
}
