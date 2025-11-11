'use client';

import { useState } from 'react';
import Layout from '../../components/Layout';
import { usePlan } from '../../hooks/usePlan';
import { useTokens } from '../../hooks/useTokens';
import { TOKEN_PACKS, TOKEN_ACTIONS_LIST, simulateTokenPurchase, formatTokenPrice } from '../../lib/tokens';
import { legalContactInfo } from '../../data/legal';

type Notice = { type: 'success' | 'error'; message: string } | null;

export default function TokenWalletPage() {
  const { entitlements } = usePlan();
  const { balance } = useTokens();
  const [notice, setNotice] = useState<Notice>(null);
  const [pendingPack, setPendingPack] = useState<string | null>(null);

  const allowanceCards = [
    { label: 'Контактов бесплатно', value: entitlements.contactLimit },
    { label: 'Наборов фактов', value: entitlements.factGroupLimit },
    { label: 'Фактов в группе', value: entitlements.factsPerGroupLimit },
  ];

  const handleSimulatePurchase = (packId: string) => {
    setPendingPack(packId);
    setNotice(null);
    const receipt = simulateTokenPurchase(packId);
    if (!receipt.ok) {
      setNotice({ type: 'error', message: receipt.message });
      setPendingPack(null);
      return;
    }
    setNotice({
      type: 'success',
      message: `Зачислено ${receipt.creditedTokens} токенов. Текущий баланс: ${receipt.balance} токенов.`,
    });
    setPendingPack(null);
  };

  return (
    <Layout>
      <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Монетизация</p>
          <h1 className="text-3xl font-semibold">Кошелёк токенов</h1>
          <p className="text-sm text-gray-400">
            Pay as you go: 20 контактов бесплатно, дальше платите токенами только за фактический рост сети. Оплата пока в
            демо-режиме — используем локальные зачисления, чтобы протестировать экономику.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-primary/40 bg-primary/10 p-5 text-white">
            <p className="text-sm text-primary/80">Баланс</p>
            <p className="mt-2 text-4xl font-bold text-primary">{balance}</p>
            <p className="text-xs text-gray-300 mt-1">токенов на счету</p>
          </article>
          {allowanceCards.map((item) => (
            <article key={item.label} className="rounded-2xl border border-gray-700 bg-gray-900/70 p-5">
              <p className="text-sm text-gray-400">{item.label}</p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {item.value == null ? '∞' : item.value}
              </p>
            </article>
          ))}
        </section>

        {notice && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              notice.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                : 'border-red-500/40 bg-red-500/10 text-red-200'
            }`}
          >
            {notice.message}
          </div>
        )}

        <section className="rounded-2xl border border-gray-700 bg-gray-900/70 p-6 space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">Пакеты токенов</h2>
              <p className="text-sm text-gray-400">
                Выберите объём пополнения — каждый следующий пакет выгоднее предыдущего. После релиза здесь появится
                интеграция с YooKassa.
              </p>
            </div>
            <span className="rounded-full border border-primary/40 px-3 py-1 text-xs text-primary">
              демо-режим оплаты
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {TOKEN_PACKS.map((pack) => {
              const totalTokens = pack.tokens + pack.bonusTokens;
              const isPending = pendingPack === pack.id;
              return (
                <article key={pack.id} className="rounded-2xl border border-gray-800 bg-gray-950/60 p-5 flex flex-col gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-primary">{pack.bestFor}</p>
                    <h3 className="mt-2 text-xl font-semibold text-white">{pack.name}</h3>
                    <p className="text-sm text-gray-400 mt-1">{pack.description}</p>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-3xl font-bold text-primary">{pack.priceRub} ₽</p>
                    <p className="text-xs text-gray-500">{formatTokenPrice(pack.priceRub, totalTokens)}</p>
                  </div>
                  <ul className="text-sm text-gray-300 space-y-1">
                    <li>Токенов: {pack.tokens} + {pack.bonusTokens} бонусов</li>
                    <li>Всего: {totalTokens} токенов</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => handleSimulatePurchase(pack.id)}
                    disabled={isPending}
                    className={`mt-auto rounded-md px-4 py-2 text-sm font-semibold transition ${
                      isPending ? 'border border-gray-700 text-gray-500' : 'bg-primary text-gray-900 hover:bg-secondary'
                    }`}
                  >
                    {isPending ? 'Зачисляем...' : `Пополнить ${totalTokens} токенов`}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-700 bg-gray-900/70 p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">Сколько списываем</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {TOKEN_ACTIONS_LIST.map((action) => (
              <article key={action.id} className="rounded-xl border border-gray-800 bg-gray-950/50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-base font-semibold text-white">{action.label}</p>
                    <p className="text-xs text-gray-400 mt-1">{action.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-primary">{action.tokens}</p>
                    <p className="text-xs text-gray-500">≈{action.approxRub} ₽</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-700 bg-gray-900/70 p-6 space-y-3 text-sm text-gray-300">
          <h2 className="text-lg font-semibold text-white">Вопросы и поддержка</h2>
          <p>
            Если нужен счёт, закрывающие документы или рефанд токенов — напишите на{' '}
            <a href={`mailto:${legalContactInfo.supportEmail}`} className="text-primary hover:underline">
              {legalContactInfo.supportEmail}
            </a>{' '}
            или позвоните {legalContactInfo.phone}. Мы ответим в течение 2 рабочих дней.
          </p>
        </section>
      </div>
    </Layout>
  );
}
