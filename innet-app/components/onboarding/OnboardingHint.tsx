import { ReactNode, useEffect, useMemo, useState } from 'react';

const STORAGE_PREFIX = 'innet_hint_';

type OnboardingHintProps = {
  id: string;
  icon?: ReactNode;
  label?: string;
  title: string;
  description?: string;
  bullets?: string[];
  ctaLabel?: string;
  onCta?: () => void;
  className?: string;
};

export default function OnboardingHint({
  id,
  icon,
  label = 'Совет',
  title,
  description,
  bullets,
  ctaLabel,
  onCta,
  className,
}: OnboardingHintProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
      if (stored === 'hidden') {
        setVisible(false);
      } else {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, [id]);

  const handleDismiss = () => {
    setVisible(false);
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${id}`, 'hidden');
    } catch {
      // ignore storage errors
    }
  };

  const handleCta = () => {
    if (onCta) {
      onCta();
    }
  };

  const body = useMemo(() => {
    if (!visible) return null;
    return (
      <aside
        className={`relative w-full rounded-xl border border-teal-500/30 bg-teal-900/10 px-4 py-4 text-sm text-teal-50 shadow-[0_20px_45px_-25px_rgba(13,148,136,0.6)] backdrop-blur-md ${className ?? ''}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-xl text-primary">
            {icon ?? '💡'}
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-teal-300">
              <span>{label}</span>
            </div>
            <h3 className="text-base font-semibold text-white">{title}</h3>
            {description && <p className="text-sm text-teal-100/80">{description}</p>}
            {bullets && bullets.length > 0 && (
              <ul className="space-y-1.5 text-sm text-teal-100/80">
                {bullets.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
            {(ctaLabel || onCta) && (
              <button
                type="button"
                onClick={handleCta}
                className="inline-flex items-center gap-2 rounded-full bg-primary/90 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-secondary/90"
              >
                {ctaLabel ?? 'Показать больше'}
                <span aria-hidden className="text-base leading-none">
                  →
                </span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="ml-3 text-xs text-teal-200 transition hover:text-teal-50"
            aria-label="Больше не показывать подсказку"
          >
            Скрыть
          </button>
        </div>
      </aside>
    );
  }, [bullets, className, ctaLabel, description, handleCta, handleDismiss, icon, label, title, visible]);

  return body;
}
