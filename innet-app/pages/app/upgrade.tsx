'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { tariffPlans, legalContactInfo } from '../../data/legal';
import { usePlan } from '../../hooks/usePlan';
import { startPayment, getPaymentStatus, type PaymentStatus } from '../../lib/payments/client';
import type { PlanProduct } from '../../lib/plans';
import { setCurrentPlan } from '../../lib/subscription';

const PENDING_PAYMENT_STORAGE_KEY = 'innet_pending_payment';

type PendingPaymentSnapshot = {
  paymentId: string;
  planId: PlanProduct;
  createdAt: number;
};

function readPendingPayment(): PendingPaymentSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_PAYMENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const { paymentId, planId, createdAt } = parsed as Record<string, unknown>;
    if (typeof paymentId !== 'string' || paymentId.length === 0) return null;
    if (planId !== 'pro-monthly' && planId !== 'pro-annual') return null;
    if (typeof createdAt !== 'number') return null;
    return { paymentId, planId, createdAt };
  } catch {
    return null;
  }
}

function writePendingPayment(snapshot: PendingPaymentSnapshot): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(PENDING_PAYMENT_STORAGE_KEY, JSON.stringify(snapshot));
}

function clearPendingPayment(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(PENDING_PAYMENT_STORAGE_KEY);
}

export default function UpgradePage() {
  const router = useRouter();
  const { plan } = usePlan();
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const [requestingPlan, setRequestingPlan] = useState<PlanProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PlanProduct | null>(null);

  const paidPlans = useMemo(() => {
    return tariffPlans.filter((item): item is typeof item & { id: PlanProduct } =>
      item.id === 'pro-monthly' || item.id === 'pro-annual'
    );
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedId = window.localStorage.getItem('innet_current_user_id') ?? '';
    const storedEmail = window.localStorage.getItem('innet_current_user_email') ?? '';
    setCurrentUserId(storedId);
    setCurrentEmail(storedEmail);

    const pending = readPendingPayment();
    if (pending) {
      setPendingPaymentId(pending.paymentId);
      setPendingPlan(pending.planId);
    }
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    const queryPaymentId = typeof router.query.payment_id === 'string' ? router.query.payment_id : undefined;
    if (!queryPaymentId) return;

    setPendingPaymentId(queryPaymentId);
    const pending = readPendingPayment();
    if (pending && pending.paymentId === queryPaymentId) {
      setPendingPlan(pending.planId);
    }
  }, [router.isReady, router.query.payment_id]);

  useEffect(() => {
    if (!pendingPaymentId) return;

    let active = true;
    setStatus('pending');
    setError(null);

    const poll = async () => {
      try {
        const result = await getPaymentStatus(pendingPaymentId);
        if (!active) return;
        setStatus(result.status);

        if (result.status === 'succeeded') {
          const resolvedPlan = result.planId ?? pendingPlan ?? readPendingPayment()?.planId ?? null;
          const activatedAt = Date.now();
          setCurrentPlan('pro', {
            planActivatedAt: activatedAt,
            planProduct: resolvedPlan ?? null,
          });
          setSuccessMessage('Оплата прошла успешно. Подписка InNet Pro активирована.');
          clearPendingPayment();
          setPendingPaymentId(null);
          setPendingPlan(resolvedPlan ?? null);
          setStatus('succeeded');
          void router.replace('/app/upgrade', undefined, { shallow: true });
          active = false;
          return;
        }

        if (result.status === 'canceled' || result.status === 'unknown') {
          clearPendingPayment();
          setPendingPaymentId(null);
          setStatus(result.status);
          setError('Оплата не была завершена. Попробуйте оформить подписку ещё раз.');
          active = false;
        }
      } catch (pollError) {
        if (!active) return;
        setError(
          pollError instanceof Error
            ? pollError.message
            : 'Не удалось проверить статус платежа. Попробуйте перезагрузить страницу.'
        );
      }
    };

    void poll();
    const interval = window.setInterval(poll, 3000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [pendingPaymentId, pendingPlan, router]);

  const handleStartPayment = useCallback(
    async (planId: PlanProduct) => {
      if (!currentUserId) {
        setError('Не удалось найти данные пользователя. Выйдите из аккаунта и войдите снова.');
        return;
      }

      setRequestingPlan(planId);
      setError(null);
      setSuccessMessage(null);

      try {
        const origin = window.location.origin;
        const { paymentId, confirmationUrl } = await startPayment({
          planId,
          userId: currentUserId,
          email: currentEmail || undefined,
          returnUrl: `${origin}/app/upgrade`,
        });

        writePendingPayment({ paymentId, planId, createdAt: Date.now() });
        window.location.href = confirmationUrl;
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Не удалось создать платёж. Попробуйте позже.'
        );
      } finally {
        setRequestingPlan(null);
      }
    },
    [currentEmail, currentUserId]
  );

  const isPro = plan === 'pro';

  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Подписка InNet Pro</h1>
          <p className="text-sm text-gray-400">
            Раскройте максимум возможностей для ведения деловых и дружеских связей: безлимитные контакты,
            синхронизация, интеллектуальные подсказки и повышенная приватность.
          </p>
          <div className="rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-3 text-sm text-gray-300">
            Текущий тариф: <span className="font-semibold text-primary">{isPro ? 'InNet Pro' : 'InNet Start'}</span>
          </div>
        </header>

        {status === 'pending' && (
          <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
            Проверяем оплату в ЮKassa... Это может занять до одной минуты.
          </div>
        )}

        {successMessage && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {successMessage}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="grid gap-6 md:grid-cols-2">
          {paidPlans.map((planOption) => {
            const isProcessing = requestingPlan === planOption.id;
            return (
              <article
                key={planOption.id}
                className="flex h-full flex-col justify-between rounded-2xl border border-gray-700 bg-gray-900/70 p-6 shadow-lg"
              >
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-primary">{planOption.billingPeriod}</p>
                    <h2 className="mt-1 text-2xl font-semibold text-white">{planOption.name}</h2>
                    <p className="mt-1 text-sm text-gray-300">{planOption.description}</p>
                  </div>
                  <div className="text-4xl font-bold text-primary">{planOption.price}</div>
                  <ul className="space-y-2 text-sm text-gray-200">
                    {planOption.features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {planOption.note && (
                    <p className="text-xs text-gray-400">
                      {planOption.note}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleStartPayment(planOption.id)}
                  disabled={isProcessing || status === 'pending'}
                  className={`mt-6 inline-flex w-full items-center justify-center rounded-md px-5 py-3 text-sm font-semibold transition ${
                    isProcessing || status === 'pending'
                      ? 'cursor-not-allowed border border-gray-700 bg-gray-800 text-gray-400'
                      : 'bg-primary text-gray-900 hover:bg-secondary'
                  }`}
                >
                  {isProcessing ? 'Перенаправляем в ЮKassa…' : planOption.cta}
                </button>
              </article>
            );
          })}
        </section>

        <section className="space-y-4 rounded-2xl border border-gray-700 bg-gray-900/70 p-6 text-sm text-gray-300">
          <h2 className="text-lg font-semibold text-white">Как работает оплата</h2>
          <ul className="space-y-2">
            <li>— Платёж обрабатывается через ЮKassa. После нажатия кнопки мы перенаправим вас на защищённую страницу оплаты.</li>
            <li>— Как только ЮKassa подтвердит оплату, доступ к InNet Pro активируется автоматически. Обновлять страницу не нужно.</li>
            <li>
              — В любой момент можно вернуться на тариф Start: напишите нам на {legalContactInfo.supportEmail} — отключим платную подписку в течение рабочего дня.
            </li>
          </ul>
        </section>
      </div>
    </Layout>
  );
}
