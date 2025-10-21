import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '../../../components/Layout';
import { loadContacts, loadFactGroups, saveContacts } from '../../../lib/storage';

/**
 * Contact detail page. Displays the information that was shared when
 * connecting, including the groups of facts the contact provided. Users
 * can remove the contact from their network. Editing of contact data
 * will be added when backend support is implemented.
 */
export default function ContactDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [name, setName] = useState('');
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [groupNames, setGroupNames] = useState<string[]>([]);

  useEffect(() => {
    if (!id || Array.isArray(id)) return;
    const contacts = loadContacts();
    const contact = contacts.find((c) => c.id === id);
    if (!contact) return;
    setName(contact.name);
    setConnectedAt(contact.connectedAt);
    // Map received group IDs to group names
    const allGroups = loadFactGroups();
    setGroupNames(
      contact.receivedGroups.map((gid) => allGroups.find((g) => g.id === gid)?.name || 'Неизвестная группа')
    );
  }, [id]);

  const removeContact = () => {
    if (!id || Array.isArray(id)) return;
    const contacts = loadContacts().filter((c) => c.id !== id);
    saveContacts(contacts);
    router.push('/app/contacts');
  };

  return (
    <Layout>
      <div className="px-4 py-8 max-w-3xl mx-auto">
        <button onClick={() => router.back()} className="text-sm text-primary hover:underline mb-4">← Назад</button>
        <h1 className="text-3xl font-bold mb-4">{name}</h1>
        {connectedAt && (
          <p className="text-sm text-gray-400 mb-6">Знакомство состоялось {new Date(connectedAt).toLocaleDateString()}</p>
        )}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Группы фактов, которыми поделился контакт</h2>
          {groupNames.length === 0 ? (
            <p className="text-sm text-gray-400">Нет данных о группах</p>
          ) : (
            <ul className="list-disc ml-5 space-y-1 text-gray-300">
              {groupNames.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
        </div>
        <button onClick={removeContact} className="bg-red-600 text-background px-5 py-2 rounded-md hover:bg-red-500 transition-colors">
          Удалить контакт
        </button>
      </div>
    </Layout>
  );
}