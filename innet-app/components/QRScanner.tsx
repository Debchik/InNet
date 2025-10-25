"use client";

import { useEffect, useRef } from "react";
import type {
  Html5Qrcode as Html5QrcodeType,
  Html5QrcodeSupportedFormats,
  Html5QrcodeCameraScanConfig,
} from "html5-qrcode";

export type QRScannerProps = {
  onScan: (decodedText: string) => void;
  onError?: (error: unknown) => void;
};

type Html5QrcodeModule = typeof import("html5-qrcode");

type ScannerConfig = Html5QrcodeCameraScanConfig & {
  experimentalFeatures?: {
    useBarCodeDetectorIfSupported?: boolean;
  };
  rememberLastUsedCamera?: boolean;
  formatsToSupport?: Html5QrcodeSupportedFormats[];
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
    let qr: Html5QrcodeType | null = null;
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
        const mod: Html5QrcodeModule = await import("html5-qrcode");
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = mod;

        if (!Html5Qrcode) {
          throw new Error("html5-qrcode не удалось загрузить. Обновите страницу.");
        }

        qr = new Html5Qrcode("reader");
        const config: ScannerConfig = {
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

        let lastStartError: Error | null = null;

        const toError = (value: unknown): Error => {
          if (value instanceof Error) return value;
          if (typeof value === "string") return new Error(value);
          if (value && typeof (value as { message?: unknown }).message === "string") {
            return new Error(String((value as { message?: unknown }).message));
          }
          return new Error("Не удалось запустить камеру. Проверьте разрешения и попробуйте снова.");
        };

        const attemptStart = async (constraint: MediaTrackConstraints | string) => {
          if (!qr) {
            lastStartError = new Error("Сканер ещё не готов к запуску.");
            return false;
          }
          try {
            await qr.start(constraint, config, successHandler, errorHandler);
            runningRef.current = true;
            return true;
          } catch (err) {
            lastStartError = toError(err);
            return false;
          }
        };

        const tryCameraStart = async () => {
          const candidates: Array<MediaTrackConstraints | string> = [
            { facingMode: "environment" },
            { facingMode: { exact: "environment" } },
            { facingMode: "user" },
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
          throw lastStartError
            ?? new Error(
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
      const currentQr = qr;
      if (!currentQr || !runningRef.current) return;
      runningRef.current = false;
      try {
        const maybePromise = currentQr.stop();
        Promise.resolve(maybePromise)
          .catch(() => undefined)
          .finally(() => {
            try {
              currentQr.clear();
            } catch {
              /* ignore */
            }
          });
      } catch {
        try {
          currentQr.clear();
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
