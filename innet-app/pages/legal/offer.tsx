import Head from 'next/head';
import Layout from '../../components/Layout';
import {
  companyDescription,
  digitalDeliveryInfo,
  legalContactInfo,
  publicOfferMeta,
  tariffPlans,
} from '../../data/legal';

export default function PublicOfferPage() {
  return (
    <Layout>
      <Head>
        <title>{publicOfferMeta.documentTitle}</title>
        <meta
          name="description"
          content="Публичная оферта сервиса InNet: условия предоставления цифровых услуг, порядок оплаты и возвратов."
        />
      </Head>
      <section className="px-4 py-16 bg-background">
        <div className="max-w-4xl mx-auto space-y-10 text-gray-100">
          <header className="space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-primary">Юридическая информация</p>
            <h1 className="text-3xl md:text-4xl font-bold">{publicOfferMeta.documentTitle}</h1>
            <p className="text-sm text-gray-400">Редакция от {publicOfferMeta.lastUpdated}</p>
            <p className="text-sm text-gray-300 leading-relaxed">
              Настоящий документ является официальным предложением заключить договор возмездного оказания услуг в порядке
              статьи 437 Гражданского кодекса РФ. Приобретая доступ к платным тарифам сервиса, вы подтверждаете согласие с
              изложенными условиями.
            </p>
          </header>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">1. Термины и стороны договора</h2>
            <p className="text-sm text-gray-300">
              {companyDescription.brandName} (далее — «Сервис») — {companyDescription.shortAbout} Плательщиком является
              физическое лицо, принимающее условия настоящей оферты (далее — «Пользователь»).
            </p>
            <div className="grid gap-4 md:grid-cols-2 rounded-xl border border-gray-700 bg-gray-800/60 p-6 text-sm">
              <div>
                <h3 className="text-sm font-semibold text-white mb-2">Исполнитель</h3>
                <p className="text-gray-300">
                  {legalContactInfo.legalHolderFullName}, ИНН {legalContactInfo.inn}
                  {legalContactInfo.ogrnip ? `, ОГРНИП ${legalContactInfo.ogrnip}` : ''}.
                  Связь: {legalContactInfo.supportEmail}, {legalContactInfo.phone}.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-2">Адрес для корреспонденции</h3>
                <p className="text-gray-300">{legalContactInfo.postalAddress}</p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">2. Предмет договора</h2>
            <p className="text-sm text-gray-300">
              Исполнитель предоставляет Пользователю доступ к функционалу сервиса в соответствии с выбранным тарифным планом.
              Услуги оказываются дистанционно в электронном виде посредством личного кабинета на сайте. Результат услуги —
              предоставление инструментов для ведения базы контактов, обмена фактами и получения напоминаний.
            </p>
            <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Актуальные тарифы</h3>
              <div className="grid gap-6">
                {tariffPlans.map((plan) => (
                  <div key={plan.id} className="border border-gray-700/80 rounded-lg p-4 bg-gray-900/40">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                      <span className="text-white font-medium text-lg">{plan.name}</span>
                      <span className="text-primary font-semibold text-lg">
                        {plan.price} <span className="ml-1 text-xs text-gray-400">{plan.billingPeriod}</span>
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 mb-3">{plan.description}</p>
                    <ul className="text-sm text-gray-200 space-y-1">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex gap-2">
                          <span className="h-1.5 w-1.5 mt-2 rounded-full bg-primary" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">3. Порядок предоставления доступа</h2>
            <p className="text-sm text-gray-300">
              После успешной оплаты система автоматически активирует выбранный тариф в пределах оплаченного срока. Доступ
              предоставляется сразу, подтверждение направляется на электронную почту пользователя. Для входа используется
              логин и пароль, указанные при регистрации.
            </p>
            <ul className="text-sm text-gray-200 space-y-2">
              {digitalDeliveryInfo.items.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">4. Оплата и продление</h2>
            <p className="text-sm text-gray-300">
              Оплата производится банковской картой, через СБП или иные доступные на сайте способы. Тариф InNet Pro оформляется
              в формате подписки с ежемесячным или годовым продлением. Автопродление можно отключить в личном кабинете перед
              очередным списанием. С момента аннулирования подписки доступ сохраняется до конца оплаченного периода.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">5. Возврат средств</h2>
            <p className="text-sm text-gray-300">
              Если услуга не подошла, Пользователь вправе запросить возврат в течение 14 календарных дней после оплаты при
              условии, что не было значительного использования функций сервиса. Заявка направляется на{' '}
              <a href={`mailto:${legalContactInfo.supportEmail}`} className="text-primary hover:underline">
                {legalContactInfo.supportEmail}
              </a>{' '}
              с описанием причины и реквизитами платежа. Рассмотрение занимает до 5 рабочих дней.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">6. Ответственность и ограничения</h2>
            <ul className="text-sm text-gray-200 space-y-2">
              <li className="flex gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <span>
                  Пользователь обязуется предоставлять достоверные данные и не передавать доступ третьим лицам без согласия
                  Исполнителя.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <span>
                  Исполнитель не несёт ответственность за невозможность использования сервиса при проблемах с оборудованием или
                  интернетом Пользователя.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <span>
                  Претензии направляются на электронную почту поддержки. Если стороны не достигли соглашения, спор подлежит
                  рассмотрению в суде по месту регистрации Исполнителя.
                </span>
              </li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">7. Заключительные положения</h2>
            <p className="text-sm text-gray-300">
              Оферта вступает в силу с момента публикации и действует до её отзыва. Исполнитель вправе обновлять текст с
              предварительным уведомлением пользователей на сайте и по электронной почте. Продолжение использования сервиса
              после изменения оферты означает согласие с новой редакцией.
            </p>
          </section>

          <footer className="text-sm text-gray-400 border-t border-gray-800 pt-4">
            <p>
              Контрольный контакт: {legalContactInfo.supportEmail}, {legalContactInfo.phone}. Время работы поддержки:{' '}
              {legalContactInfo.workingHours}.
            </p>
          </footer>
        </div>
      </section>
    </Layout>
  );
}
