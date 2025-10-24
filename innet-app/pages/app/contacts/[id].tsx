import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import Layout from '../../../components/Layout';
import {
  Contact,
  CONTACT_NOTE_LIMIT,
  CONTACT_NOTE_MAX,
  createContactNote,
  loadContacts,
  loadFactGroups,
  saveContacts,
  updateContact,
} from '../../../lib/storage';
import { formatRelative } from '../../../utils/time';

export default function ContactDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [contact, setContact] = useState<Contact | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || Array.isArray(id)) return;
    const contacts = loadContacts();
    const found = contacts.find((item) => item.id === id);
    if (!found) return;
    setContact(found);
  }, [id]);

  const knownGroups = useMemo(() => loadFactGroups(), []);

  const handleDeleteContact = () => {
    if (!contact) return;
    const rest = loadContacts().filter((item) => item.id !== contact.id);
    saveContacts(rest);
    router.push('/app/contacts');
  };

  const handleAddNote = (event: React.FormEvent) => {
    event.preventDefault();
    if (!contact) return;
    const trimmed = noteText.trim();
    if (!trimmed) {
      setNoteError('Сначала введите текст заметки.');
      return;
    }
    if (contact.notes.length >= CONTACT_NOTE_MAX) {
      setNoteError('Достигнут лимит заметок. Удалите одну, чтобы добавить новую.');
      return;
    }
    const note = createContactNote(trimmed);
    const updated: Contact = {
      ...contact,
      notes: [note, ...contact.notes],
    };
    updateContact(updated);
    setContact(updated);
    setNoteText('');
    setNoteError(null);
  };

  const handleDeleteNote = (noteId: string) => {
    if (!contact) return;
    const updated: Contact = {
      ...contact,
      notes: contact.notes.filter((note) => note.id !== noteId),
    };
    updateContact(updated);
    setContact(updated);
  };

  if (!contact) {
    return (
      <Layout>
        <div className="px-4 py-10 text-center text-gray-400">
          Контакт не найден. Возможно, он был удалён.
        </div>
      </Layout>
    );
  }

  const connectedLabel = formatRelative(contact.connectedAt);

  return (
    <Layout>
      <div className="px-4 py-8 mx-auto w-full max-w-4xl">
        <button
          onClick={() => router.back()}
          className="mb-4 text-sm text-primary hover:underline"
        >
          ← Назад
        </button>
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-2xl font-semibold text-slate-100">
              {contact.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={contact.avatar} alt={contact.name} className="h-full w-full object-cover" />
              ) : (
                contact.name.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-100">{contact.name}</h1>
              <p className="text-sm text-slate-400">Знакомство состоялось {connectedLabel}</p>
            </div>
          </div>
          <button
            onClick={handleDeleteContact}
            className="mt-3 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-red-500 md:mt-0"
          >
            Удалить контакт
          </button>
        </header>

        {(contact.phone || contact.telegram || contact.instagram) && (
          <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="text-lg font-semibold text-slate-100">Контакты</h2>
            <ul className="mt-2 space-y-1 text-sm text-slate-300">
              {contact.phone && <li>Телефон: {contact.phone}</li>}
              {contact.telegram && <li>Telegram: {contact.telegram}</li>}
              {contact.instagram && <li>Instagram: {contact.instagram}</li>}
            </ul>
          </div>
        )}

        <section className="mt-6 rounded-xl bg-slate-900/70 p-5 shadow">
          <h2 className="text-xl font-semibold text-slate-100">Факты, которыми поделился контакт</h2>
          {contact.groups.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              Пока нет ни одной группы фактов. Попробуйте снова отсканировать его QR-код.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {contact.groups.map((group) => (
                <article key={group.id} className="rounded-lg border border-slate-700 bg-slate-950/80 p-4">
                  <header className="mb-2">
                    <p className="text-sm text-slate-400">
                      {resolveGroupLabel(group.id, knownGroups, group.name)}
                    </p>
                    <h3 className="text-lg font-semibold" style={{ color: group.color }}>
                      {group.name}
                    </h3>
                  </header>
                  {group.facts.length === 0 ? (
                    <p className="text-xs text-slate-500">Пока без фактов.</p>
                  ) : (
                    <ul className="space-y-2">
                      {group.facts.map((fact) => (
                        <li
                          key={fact.id}
                          className="rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-200"
                        >
                          {fact.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-xl font-semibold text-slate-100">Заметки</h2>
          <p className="text-sm text-slate-400">
            Храните личные заметки о человеке. Видны только вам.
          </p>
          <form onSubmit={handleAddNote} className="mt-4 space-y-2">
            <textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value.slice(0, CONTACT_NOTE_LIMIT))}
              rows={3}
              maxLength={CONTACT_NOTE_LIMIT}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-primary"
              placeholder="Добавьте заметку о встрече, интересах или договорённостях..."
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-slate-500">
                {noteText.length}/{CONTACT_NOTE_LIMIT}
              </span>
              <button
                type="submit"
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-background transition hover:bg-secondary sm:w-auto"
              >
                Сохранить заметку
              </button>
            </div>
            {noteError && <p className="text-xs text-red-400">{noteError}</p>}
          </form>

          <div className="mt-5 space-y-3">
            {contact.notes.length === 0 ? (
              <p className="text-sm text-slate-500">Заметок пока нет.</p>
            ) : (
              contact.notes.map((note) => (
                <div
                  key={note.id}
                  className="flex items-start justify-between rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                >
                  <div>
                    <p>{note.text}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Добавлено {formatRelative(note.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    className="ml-3 text-xs text-red-400 hover:text-red-300"
                  >
                    удалить
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
}

function resolveGroupLabel(
  groupId: string,
  knownGroups: ReturnType<typeof loadFactGroups>,
  fallback: string
) {
  const match = knownGroups.find((group) => group.id === groupId);
  return match ? `Также у вас: ${match.name}` : fallback;
}
