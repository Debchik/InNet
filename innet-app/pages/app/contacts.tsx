import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { loadContacts } from '../../lib/storage';
import Link from 'next/link';

/**
 * Contacts list page. Displays all contacts sorted by most recent first,
 * highlights those added within the last 7 days and provides a simple
 * search filter. Clicking a contact navigates to their detail page.
 */
export default function ContactsPage() {
  const [contacts, setContacts] = useState(loadContacts());
  const [query, setQuery] = useState('');
  const [filtered, setFiltered] = useState(contacts);

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

  return (
    <Layout>
      <div className="px-4 py-8 max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Мои контакты</h1>
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