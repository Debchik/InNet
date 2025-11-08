import { useEffect, useMemo, useState } from 'react';
import Layout from '../../components/Layout';
import OnboardingHint from '../../components/onboarding/OnboardingHint';
import { loadContacts } from '../../lib/storage';
import Link from 'next/link';
import { usePlan } from '../../hooks/usePlan';
import { isUnlimited } from '../../lib/plans';

/**
 * Contacts list page. Displays all contacts sorted by most recent first,
 * highlights those added within the last 7 days and provides a simple
 * search filter. Clicking a contact navigates to their detail page.
 */
export default function ContactsPage() {
  const [contacts, setContacts] = useState(loadContacts());
  const [query, setQuery] = useState('');
  const [filtered, setFiltered] = useState(contacts);
  const { entitlements } = usePlan();
  const contactLimitInfo = useMemo(() => {
    if (isUnlimited(entitlements.contactLimit)) {
      return { text: 'Контакты без ограничений', reached: false };
    }
    const limit = entitlements.contactLimit ?? 0;
    const count = contacts.length;
    const reached = count >= limit;
    return {
      text: `${count}/${limit} контактов первого круга`,
      reached,
    };
  }, [contacts.length, entitlements.contactLimit]);

  useEffect(() => {
    setContacts(loadContacts());
  }, []);

  useEffect(() => {
    const q = query.toLowerCase();
    setFiltered(
      contacts.filter((c) => c.name.toLowerCase().includes(q)).sort((a, b) => b.connectedAt - a.connectedAt)
    );
  }, [query, contacts]);

  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;

  const withAlpha = (hex: string, alpha: number) => {
    if (!hex || !hex.startsWith('#')) return hex;
    const value = hex.replace('#', '');
    const base = value.slice(0, 6);
    const alphaHex = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
      .toString(16)
      .padStart(2, '0');
    return `#${base}${alphaHex}`;
  };

  return (
    <Layout>
      <div className="px-4 py-8 max-w-5xl mx-auto">
        <OnboardingHint
          id="contacts"
          title="Все знакомые — в одном месте"
          description="После обмена QR-кодом контакт появится здесь. Добавляйте заметки, чтобы помнить, о чём договорились."
          bullets={[
            'Новые записи помечаются бейджем «New» в течение недели.',
            'Найдите человека по имени — поиск обновляется на лету.',
            'Про тариф Start напоминаем лимит 40 контактов; Pro даёт безлимит.',
          ]}
          className="mb-6"
        />
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <h1 className="text-3xl font-bold">Мои контакты</h1>
          <p
            className={`text-sm ${
              contactLimitInfo.reached ? 'text-red-400' : 'text-gray-400'
            }`}
          >
            {contactLimitInfo.text}
            {contactLimitInfo.reached ? ' — лимит достигнут' : ''}
          </p>
        </div>
        <div className="mb-4">
          <input
            type="text"
            placeholder="Поиск по имени..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full md:w-1/2 px-4 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="space-y-3">
          {filtered.length === 0 && (
            <p className="text-gray-400 text-sm">Контактов пока нет. Добавьте новые, отсканировав чей‑то QR‑код.</p>
          )}
          {filtered.map((contact) => {
            const isRecent = now - contact.connectedAt < oneWeek;
            return (
              <Link key={contact.id} href={`/app/contacts/${contact.id}`} className="block bg-gray-800 rounded-md p-4 hover:bg-gray-700 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {/* Avatar placeholder */}
                      <div className="h-10 w-10 rounded-full bg-gray-600 flex items-center justify-center text-lg text-gray-300">
                        {contact.name.charAt(0).toUpperCase()}
                      </div>
                  <div>
                    <p className="font-semibold">{contact.name}</p>
                    <p className="text-xs text-gray-400">
                      Добавлен {new Date(contact.connectedAt).toLocaleDateString()}
                    </p>
                    {contact.tags && contact.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {contact.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                            style={{
                              borderColor: withAlpha(tag.color, 0.5),
                              backgroundColor: withAlpha(tag.color, 0.16),
                              color: tag.color,
                            }}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: tag.color }}
                            />
                            {tag.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                    {isRecent && (
                      <span className="text-xs text-green-400">New</span>
                    )}
                  </div>
              </Link>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
