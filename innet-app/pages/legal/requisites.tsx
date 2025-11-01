import Head from 'next/head';
import Layout from '../../components/Layout';
import { legalContactInfo } from '../../data/legal';

const requisitesList = [
  { label: 'ФИО самозанятого', value: legalContactInfo.legalHolderFullName },
  { label: 'ИНН', value: legalContactInfo.inn },
  { label: 'Телефон', value: legalContactInfo.phone, href: `tel:${legalContactInfo.phone.replace(/\s|\(|\)|-/g, '')}` },
  { label: 'Электронная почта', value: legalContactInfo.supportEmail, href: `mailto:${legalContactInfo.supportEmail}` },
  { label: 'Время работы поддержки', value: legalContactInfo.workingHours },
].filter((item) => Boolean(item.value));

export default function LegalRequisitesPage() {
  return (
    <Layout>
      <Head>
        <title>Контакты и реквизиты InNet</title>
        <meta
          name="description"
          content="Контактные данные и реквизиты исполнителя цифрового сервиса InNet для оплаты через ЮKassa."
        />
      </Head>
      <section className="px-4 py-16 bg-background">
        <div className="max-w-3xl mx-auto space-y-8 text-gray-100">
          <header className="space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-primary">Контакты и реквизиты</p>
            <h1 className="text-3xl font-bold">Как связаться с InNet</h1>
            <p className="text-sm text-gray-300">
              Ниже размещены официальные данные для договоров, оплаты и обратной связи. Укажите ссылку на эту страницу в
              кабинете ЮKassa, чтобы заявка прошла модерацию.
            </p>
          </header>

          <section className="rounded-2xl border border-gray-700 bg-gray-800/60 p-8 space-y-6">
            <h2 className="text-xl font-semibold text-white">Основные реквизиты</h2>
            <dl className="grid gap-x-6 gap-y-4 md:grid-cols-2 text-sm">
              {requisitesList.map(({ label, value, href }) => (
                <div key={label} className="space-y-1">
                  <dt className="font-medium text-gray-400">{label}</dt>
                  <dd className="text-gray-100">
                    {href ? (
                      <a href={href} className="text-primary hover:underline">
                        {value}
                      </a>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl border border-gray-700 bg-gray-800/40 p-6 text-sm text-gray-200 space-y-3">
            <h2 className="text-lg font-semibold text-white">Порядок обращения</h2>
            <p>
              Письма по вопросам оплаты и возврата принимаются на почту{' '}
              <a href={`mailto:${legalContactInfo.supportEmail}`} className="text-primary hover:underline">
                {legalContactInfo.supportEmail}
              </a>
              . Ответ поступает в течение одного рабочего дня.
            </p>
            <p>
              По срочным вопросам используйте номер телефона{' '}
              <a href={`tel:${legalContactInfo.phone.replace(/\s|\(|\)|-/g, '')}`} className="text-primary hover:underline">
                {legalContactInfo.phone}
              </a>{' '}
              в рабочее время ({legalContactInfo.workingHours}).
            </p>
            <p>
              Претензии по качеству услуги и возвраты рассматриваем в течение 10 рабочих дней. В письме укажите идентификатор
              платежа и описание ситуации.
            </p>
            <p>
              Для официальных запросов направляйте письма на электронную почту поддержки. При необходимости мы предоставим
              юридический адрес и дополнительные реквизиты по запросу.
            </p>
          </section>
        </div>
      </section>
    </Layout>
  );
}
