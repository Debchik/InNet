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
  const togglesTotal = TOGGLES.length;

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
  const activeCount = states.filter(Boolean).length;
  const progressPercent = Math.max(24, Math.min(96, activeCount * 27));

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="relative w-full max-w-sm">
        <div
          className="absolute -inset-6 rounded-[42px] bg-gradient-to-r from-primary/40 via-cyan-400/30 to-emerald-400/40 opacity-70 blur-3xl animate-pulse"
          aria-hidden="true"
        />
        <div
          className={clsx(
            "relative rounded-[36px] border border-cyan-500/30 bg-gradient-to-br from-slate-950/90 via-slate-900/70 to-slate-900/50 p-6 shadow-[0_25px_80px_rgba(8,145,178,0.35)] backdrop-blur-2xl transition-all duration-300",
            qrAnimating ? "scale-[0.97] opacity-[0.85] blur-[1px]" : "scale-100 opacity-100"
          )}
        >
          <div className="flex items-center justify-between text-[0.58rem] font-semibold uppercase tracking-[0.35em] text-cyan-100/70">
            <span>InNet preview</span>
            <span>{activeCount.toString().padStart(2, "0")} фактов</span>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl border border-white/10 bg-gradient-to-br from-primary to-emerald-400 p-1">
              <div className="h-full w-full rounded-xl border border-white/10 bg-slate-950/80" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">Мой QR для знакомства</p>
              <p className="text-xs text-gray-400">Обновляется в реальном времени</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">Trust</p>
              <p className="text-lg font-bold text-primary">{progressPercent}%</p>
            </div>
          </div>
          <div className="relative mt-6 rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-inner overflow-hidden">
            <div className="pointer-events-none absolute inset-3 rounded-3xl border border-white/10 opacity-30" />
            <div
              className="pointer-events-none absolute -inset-10 bg-[conic-gradient(from_180deg_at_50%_50%,rgba(13,148,136,0.12),transparent)] opacity-70 animate-pulse"
              aria-hidden="true"
            />
            <div className="relative flex items-center justify-center">
              <QRCode
                value={qrValue}
                fgColor="#80F2E3"
                bgColor="transparent"
                level="L"
                style={{
                  width: "min(70vw, 300px)",
                  height: "min(70vw, 300px)",
                  filter: "drop-shadow(0 20px 40px rgba(8,145,178,0.45))",
                }}
              />
            </div>
            <div
              className="pointer-events-none absolute inset-x-10 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent animate-pulse"
              aria-hidden="true"
            />
          </div>
          <div className="mt-5 flex items-center justify-between text-xs text-gray-300">
            <div>
              <p className="font-semibold text-white">Live-share</p>
              <p className="text-[0.7rem] uppercase tracking-[0.2em] text-gray-400">обновляется каждые 3 c</p>
            </div>
            <span className="rounded-full border border-primary/40 px-3 py-1 font-semibold text-primary">
              innet.app/demo
            </span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between text-sm text-gray-300">
          <span>Чем хотите поделиться сегодня?</span>
          <span className="text-primary font-semibold">
            {activeCount}/{togglesTotal}
          </span>
        </div>
        <div className="flex flex-col gap-3">
          {TOGGLES.map((t, i) => {
            const on = states[i];
            return (
              <button
                key={t.key}
                onClick={() => toggleAt(i)}
                className={clsx(
                  "group flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all duration-300",
                  on
                    ? "border-primary/50 bg-primary/10 shadow-[0_10px_25px_rgba(13,148,136,0.25)]"
                    : "border-gray-700/70 bg-gray-800/40 hover:border-primary/30 hover:bg-gray-800/60"
                )}
                aria-pressed={on}
              >
                <div>
                  <p className="text-sm font-semibold text-white">{t.label}</p>
                  <p className="text-xs text-gray-400">
                    {on ? "Включено в QR" : "Нажмите, чтобы добавить"}
                  </p>
                </div>
                <div
                  className={clsx(
                    "relative w-12 h-8 rounded-full p-1 flex-shrink-0 transition-colors duration-300",
                    on
                      ? "bg-gradient-to-r from-primary to-emerald-400 shadow-[0_6px_16px_rgba(13,148,136,0.24)]"
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
    </div>
  );
}
