import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Layout from '../components/Layout';
import QRCodeToggler from '../components/QRCodeToggler';
import { ctaSlogans } from '../utils/slogans';
import { companyDescription, digitalDeliveryInfo, legalContactInfo, tariffPlans } from '../data/legal';
import { seoConfig } from '../lib/seo';
import type { SchemaEntity, SeoHeadProps } from '../components/SeoHead';

const HERO_PHRASES = [
  'Будешь помнить завтра',
  'Будешь помнить через неделю',
  'Будешь помнить через месяц',
  'Будешь помнить через год',
  'Не забудешь никогда',
] as const;

const HOMEPAGE_STRUCTURED_DATA: SchemaEntity[] = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'InNet — цифровая визитка и сеть знакомств',
    url: seoConfig.siteUrl,
    inLanguage: 'ru-RU',
    potentialAction: {
      '@type': 'RegisterAction',
      target: `${seoConfig.siteUrl}/register`,
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: companyDescription.brandName,
    url: seoConfig.siteUrl,
    logo: `${seoConfig.siteUrl}/landing.png`,
    sameAs: [] as string[],
    contactPoint: {
      '@type': 'ContactPoint',
      email: legalContactInfo.supportEmail,
      telephone: legalContactInfo.phone,
      contactType: 'customer support',
      areaServed: 'RU',
      availableLanguage: 'Russian',
    },
  },
] as const;

const HOMEPAGE_SEO: SeoHeadProps = {
  title: 'InNet — цифровая визитка, QR и сеть знакомств',
  description:
    'InNet превращает знакомство в событие: динамические QR-коды, наборы фактов о вас и умные напоминания помогают удерживать внимание людей надолго.',
  keywords: ['цифровая визитка', 'QR визитка', 'нетворкинг сервис', 'менеджер контактов', 'InNet'],
  image: `${seoConfig.siteUrl}/landing.png`,
  structuredData: HOMEPAGE_STRUCTURED_DATA,
};

/**
 * Landing page for InNet. This page introduces the project, displays
 * a dynamic QR code teaser and explains how the application works.  
 * Each block ends with a call-to-action inviting users to register.
 */
export default function Home() {
  const [cta, setCta] = useState(ctaSlogans[0]);

  // Анимация динамического текста
  const phrases = HERO_PHRASES;
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [phase, setPhase] = useState<'typing' | 'pausing' | 'erasing'>('typing');
  const prevPhraseRef = useRef<string>(phrases[0]);

  useEffect(() => {
    setCta(ctaSlogans[Math.floor(Math.random() * ctaSlogans.length)]);
  }, []);


  // Основная анимация текста (печать/стирание/пауза)
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const current = phrases[phraseIndex];

    if (phase === 'typing') {
      if (displayed.length < current.length) {
        timeout = setTimeout(() => {
          setDisplayed(current.slice(0, displayed.length + 1));
        }, 36);
      } else {
        timeout = setTimeout(() => setPhase('pausing'), 2000);
      }
    } else if (phase === 'pausing') {
      timeout = setTimeout(() => {
        setPhase('erasing');
      }, 200);
    } else if (phase === 'erasing') {
      // Если следующая фраза начинается с того же префикса — стираем только до него, иначе полностью
      const nextIndex = (phraseIndex + 1) % phrases.length;
      const next = phrases[nextIndex];
      let nextPrefix = '';
      for (let i = 0; i < Math.min(current.length, next.length); i++) {
        if (current[i].toLowerCase() === next[i].toLowerCase()) {
          nextPrefix += current[i];
        } else {
          break;
        }
      }
      const eraseTo = nextPrefix.length;
      if (displayed.length > eraseTo) {
        timeout = setTimeout(() => {
          setDisplayed(displayed.slice(0, -1));
        }, 24);
      } else {
        // Переходим к следующей фразе
        prevPhraseRef.current = current;
        setPhraseIndex((i) => (i + 1) % phrases.length);
        setPhase('typing');
      }
    }
    return () => clearTimeout(timeout);
  }, [displayed, phraseIndex, phase, phrases]);

  return (
    <Layout seo={HOMEPAGE_SEO}>
      {/* Hero Section */}
      <section className="px-4 py-20">
      <div className="max-w-5xl mx-auto grid grid-cols-1 gap-8 md:grid-cols-2 md:items-center">
          <div className="max-w-xl text-center md:text-left">
          <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight mb-4">
            Помни каждого и выгляди мегачеловеком
          </h1>
          <div className="text-2xl sm:text-3xl font-semibold mb-6 min-h-[2.5em] h-[2.5em] flex items-end justify-center md:justify-start">
          <span className="transition-colors duration-300 text-white break-words">{displayed}</span>
          <span aria-hidden="true" className="w-px h-[1.2em] ml-1 bg-primary animate-blink rounded-sm align-text-bottom self-end" />
          </div>
          <p className="text-lg text-gray-300 mb-8">
            InNet держит в памяти факты, заметки и триггеры о людях, чтобы ты возвращался к каждому с точным контекстом. Покажи динамический QR — и собеседник видит, что ты не забываешь деталей и умеешь заботиться о связи.
          </p>

          <Link
            href="/register"
            className="inline-block rounded-md bg-primary px-6 py-3 text-lg font-semibold text-background shadow transition-colors hover:bg-secondary"
          >
            {cta}
          </Link>
        </div>
        <div className="flex justify-center md:justify-end">
          <QRCodeToggler />
        </div>
      </div>
      </section>

      {/* How It Works Section */}
      <section className="px-4 py-16 bg-gradient-to-b from-background to-gray-900">
        <h2 className="text-3xl font-bold mb-8 text-center">Как InNet делает знакомство желанным</h2>
        <div className="grid md:grid-cols-3 gap-10 max-w-5xl mx-auto">
          {/* Step 1 */}
          <div className="flex flex-col items-center text-center p-6 bg-gray-800 rounded-xl shadow">
            <div className="text-4xl mb-4">1</div>
            <h3 className="text-xl font-semibold mb-2">Собери историю, которая цепляет</h3>
            <p className="text-sm text-gray-300 mb-4">Разбей себя на группы фактов: достижения, личные триггеры, ссылки и инсайды. Показывай конкретному человеку только то, что усиливает доверие.</p>
            <Link href="/register" className="mt-auto bg-primary text-background px-4 py-2 rounded-md text-sm font-medium hover:bg-secondary transition-colors">
              Собрать факты
            </Link>
          </div>
          {/* Step 2 */}
          <div className="flex flex-col items-center text-center p-6 bg-gray-800 rounded-xl shadow">
            <div className="text-4xl mb-4">2</div>
            <h3 className="text-xl font-semibold mb-2">Создай продающий QR</h3>
            <p className="text-sm text-gray-300 mb-4">В один тап собираешь динамический QR с актуальными данными, оффером и тонной контекста. Он выглядит премиально, обновляется мгновенно и работает на любом экране.</p>
            <Link href="/register" className="mt-auto bg-primary text-background px-4 py-2 rounded-md text-sm font-medium hover:bg-secondary transition-colors">
              Сделать свой QR
            </Link>
          </div>
          {/* Step 3 */}
          <div className="flex flex-col items-center text-center p-6 bg-gray-800 rounded-xl shadow">
            <div className="text-4xl mb-4">3</div>
            <h3 className="text-xl font-semibold mb-2">Расширяй тёплую сеть</h3>
            <p className="text-sm text-gray-300 mb-4">Сканируй чужие коды, сохраняй заметки и ставь напоминания. InNet помогает вовремя писать, перезапускать диалог и превращать знакомства в сделки, друзей или партнёрства.</p>
            <Link href="/register" className="mt-auto bg-primary text-background px-4 py-2 rounded-md text-sm font-medium hover:bg-secondary transition-colors">
              Запустить рост сети
            </Link>
          </div>
        </div>
      </section>

      {/* Scan Explanation Section */}
      <section className="px-4 py-16">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-2xl font-bold mb-4">Добавляйте людей в сеть за секунду</h2>
            <p className="text-gray-300 mb-4">
              Сканируя чужой QR, вы видите, чем человек готов поделиться прямо сейчас. Выбираете факты в ответ, добавляете заметку, и контакт сохраняется вместе с планом тёплого касания. Ни один интересный знакомый больше не потеряется.
            </p>
            <Link href="/register" className="bg-primary text-background px-6 py-3 rounded-md text-base font-semibold hover:bg-secondary transition-colors">
              Попробовать вживую
            </Link>
          </div>
          {/* ...блок предпросмотра сканирования и картинка удалены по запросу... */}
        </div>
      </section>

      {/* Pricing Section */}
      <section className="px-4 py-16 bg-gray-900/60">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Тарифы, которые окупаются с первой встречи</h2>
          <p className="text-gray-300 text-center max-w-3xl mx-auto mb-10">
            {companyDescription.shortAbout} Выберите режим под себя: начните бесплатно, а за расширенной автоматикой и бесконечным нетворкингом приходите в InNet Pro.
          </p>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {tariffPlans.map((plan) => (
              <article
                key={plan.id}
                className={`rounded-2xl border bg-gray-800/70 p-6 flex flex-col shadow-lg ${
                  plan.badge ? 'border-primary/60 shadow-[0_25px_60px_-35px_rgba(13,148,136,0.9)]' : 'border-gray-700'
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    {plan.badge && (
                      <span className="inline-flex items-center rounded-full bg-primary/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-primary">
                        {plan.badge}
                      </span>
                    )}
                    <h3 className="mt-2 text-2xl font-semibold text-white">{plan.name}</h3>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-primary">{plan.price}</div>
                    <div className="text-xs uppercase tracking-wide text-gray-400">{plan.billingPeriod}</div>
                  </div>
                </div>
                <p className="text-gray-300 text-sm mb-5">{plan.description}</p>
                <ul className="space-y-2 text-sm text-gray-200 mb-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                {plan.note && (
                  <p className="mb-6 text-xs text-gray-400 border border-primary/20 rounded-lg bg-primary/5 px-3 py-2">
                    {plan.note}
                  </p>
                )}
                <Link
                  href={plan.id === 'free' ? '/register' : `/register?plan=${encodeURIComponent(plan.id)}`}
                  className="mt-auto inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-background transition hover:bg-secondary"
                >
                  {plan.cta}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Digital Delivery Section */}
      <section className="px-4 py-16 bg-background">
        <div className="max-w-4xl mx-auto bg-gray-800/70 border border-gray-700 rounded-2xl p-8 shadow">
          <h2 className="text-2xl font-bold mb-4">Как мы включаем доступ</h2>
          <p className="text-gray-300 mb-6">
            InNet — полностью цифровой сервис. После регистрации вы попадаете в личный кабинет, а оплата мгновенно открывает нужный тариф без звонков и ожидания менеджера.
          </p>
          <ul className="space-y-3 text-sm text-gray-200">
            {digitalDeliveryInfo.items.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-gray-400 mt-6">
            Если нужно помочь с подключением или сменой тарифа, напишите на{' '}
            <a href={`mailto:${legalContactInfo.supportEmail}`} className="text-primary hover:underline">
              {legalContactInfo.supportEmail}
            </a>{' '}
            — отвечаем в рабочие часы в течение одного дня.
          </p>
        </div>
      </section>
    </Layout>
  );
}
