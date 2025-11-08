"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import clsx from "clsx";

/**
 * Modern toggle-bar QR preview.
 * - Replaces pill labels with animated toggle-bars (knob + bar)
 * - Each toggle has an independent boolean state
 * - Every 1–3 seconds a random toggle is chosen and its state is inverted
 * - When on the toggle glows; when off it is dimmed
 */
const TOGGLES = [
  { key: "interests", label: "Интересы" },
  { key: "values", label: "Ценности" },
  { key: "hobbies", label: "Увлечения" },
];

export default function QRCodeToggler() {
  // boolean state for each toggle
  const [states, setStates] = useState<boolean[]>(() => TOGGLES.map(() => false));
  const timeoutRef = useRef<number | null>(null);
  const animRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const firstRender = useRef(true);
  const [qrAnimating, setQrAnimating] = useState(false);

  useEffect(() => {
    mountedRef.current = true;

    function scheduleNext() {
      // random delay between 1000 and 8000 ms (1..8s)
      const delay = 1000 + Math.floor(Math.random() * 7000);
      timeoutRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return;
        // pick a random toggle and invert it
        const idx = Math.floor(Math.random() * TOGGLES.length);
        setStates((prev) => {
          const copy = [...prev];
          copy[idx] = !copy[idx];
          return copy;
        });
        scheduleNext();
      }, delay);
    }

    scheduleNext();

    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      if (animRef.current) window.clearTimeout(animRef.current);
    };
  }, []);

  // animate QR blur/diffuse whenever any toggle changes (skip initial mount)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // start QR animation
    setQrAnimating(true);
    if (animRef.current) window.clearTimeout(animRef.current);
    animRef.current = window.setTimeout(() => {
      setQrAnimating(false);
      animRef.current = null;
    }, 500);
    return () => {
      if (animRef.current) window.clearTimeout(animRef.current);
    };
  }, [states]);

  // allow manual toggle via click
  function toggleAt(i: number) {
    setStates((prev) => {
      const copy = [...prev];
      copy[i] = !copy[i];
      return copy;
    });
  }

  // QR-код на главной указывает на лендинг
  const qrValue = "https://innet-lac.vercel.app/";

  return (
    <div className="flex flex-col items-center">
      <div
        className={clsx(
          "p-5 bg-gradient-to-br from-gray-900/60 to-gray-800/40 backdrop-blur-md rounded-3xl shadow-2xl transition-transform duration-300",
          qrAnimating ? "filter blur-sm opacity-70 scale-95" : "filter-none"
        )}
      >
        <QRCode
          value={qrValue}
          fgColor="#0D9488"
          bgColor="transparent"
          level="L"
          style={{
            width: 'min(65vw, 280px)',
            height: 'min(65vw, 280px)',
          }}
        />
      </div>

      <div className="mt-4 text-sm text-gray-300">Чем хотите поделиться сегодня?</div>

      <div className="flex items-center gap-3 mt-3">
        {TOGGLES.map((t, i) => {
          const on = states[i];
          return (
            <button
              key={t.key}
              onClick={() => toggleAt(i)}
              className="flex items-center gap-2 bg-transparent"
              aria-pressed={on}
            >
              <span className="text-sm font-medium text-gray-100 select-none">{t.label}</span>

              {/* iOS-like Toggle */}
              <div
                className={clsx(
                  "relative w-12 h-8 rounded-full p-1 flex-shrink-0 transition-colors duration-300",
                  on
                    ? "bg-gradient-to-r from-primary to-emerald-400 shadow-[0_6px_16px_rgba(13,148,136,0.14)]"
                    : "bg-gray-700/60"
                )}
              >
                <div
                  className={clsx(
                    "w-6 h-6 bg-white rounded-full shadow-sm transform transition-transform duration-300",
                    on ? "translate-x-4" : "translate-x-0",
                    on ? "ring-1 ring-primary/60" : ""
                  )}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
