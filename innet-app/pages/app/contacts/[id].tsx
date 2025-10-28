import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
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
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editTelegram, setEditTelegram] = useState('');
  const [editInstagram, setEditInstagram] = useState('');
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const handleNoteChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const raw = event.target.value;
    const next = raw.slice(0, CONTACT_NOTE_LIMIT);
    if (
      next.length === CONTACT_NOTE_LIMIT &&
      next.length !== noteText.length &&
      (!noteError || noteError === 'Достигнут лимит символов для заметки.')
    ) {
      setNoteError('Достигнут лимит символов для заметки.');
    } else if (noteError === 'Достигнут лимит символов для заметки.' && next.length < CONTACT_NOTE_LIMIT) {
      setNoteError(null);
    }
    setNoteText(next);
  };

  useEffect(() => {
    if (!id || Array.isArray(id)) return;
    const contacts = loadContacts();
    const found = contacts.find((item) => item.id === id);
    if (!found) return;
    setContact(found);
  }, [id]);

  useEffect(() => {
    if (!contact) return;
    setEditPhone(contact.phone ?? '');
    setEditTelegram(contact.telegram ?? '');
    setEditInstagram(contact.instagram ?? '');
  }, [contact]);

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

  const normalizeHandle = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
  };

  const handleStartEdit = () => {
    if (!contact) return;
    setEditError(null);
    setEditMessage(null);
    setEditPhone(contact.phone ?? '');
    setEditTelegram(contact.telegram ?? '');
    setEditInstagram(contact.instagram ?? '');
    setIsEditingDetails(true);
  };

  const handleCancelEdit = () => {
    if (!contact) {
      setIsEditingDetails(false);
      return;
    }
    setIsEditingDetails(false);
    setEditError(null);
    setEditMessage(null);
    setEditPhone(contact.phone ?? '');
    setEditTelegram(contact.telegram ?? '');
    setEditInstagram(contact.instagram ?? '');
  };

  const handleSaveDetails = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contact) return;
    setEditError(null);
    setEditMessage(null);

    const phoneValue = editPhone.trim();
    const telegramValue = normalizeHandle(editTelegram);
    const instagramValue = normalizeHandle(editInstagram);

    const updated: Contact = {
      ...contact,
      phone: phoneValue ? phoneValue : undefined,
      telegram: telegramValue,
      instagram: instagramValue,
      lastUpdated: Date.now(),
    };

    try {
      updateContact(updated);
      setContact(updated);
      setIsEditingDetails(false);
      setEditMessage('Контакты обновлены.');
    } catch (error) {
      console.error('Не удалось обновить контакт', error);
      setEditError('Не удалось сохранить изменения. Попробуйте позже.');
    }
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
        </header>

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Контакты</h2>
            <button
              type="button"
              onClick={() => (isEditingDetails ? handleCancelEdit() : handleStartEdit())}
              className="self-start rounded-full border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-primary hover:text-primary"
            >
              {isEditingDetails ? 'Отмена' : 'Редактировать'}
            </button>
          </div>
          {editMessage && !isEditingDetails && (
            <p className="mt-2 text-xs text-emerald-300">{editMessage}</p>
          )}
          {editError && <p className="mt-2 text-xs text-red-400">{editError}</p>}
          {isEditingDetails ? (
            <form onSubmit={handleSaveDetails} className="mt-4 space-y-3">
              <label className="space-y-1 text-sm text-slate-300">
                <span>Телефон</span>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(event) => setEditPhone(event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-primary"
                  placeholder="Например, +7 (999) 123-45-67"
                />
              </label>
              <label className="space-y-1 text-sm text-slate-300">
                <span>Telegram</span>
                <input
                  type="text"
                  value={editTelegram}
                  onChange={(event) => setEditTelegram(event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-primary"
                  placeholder="@username"
                />
              </label>
              <label className="space-y-1 text-sm text-slate-300">
                <span>Instagram</span>
                <input
                  type="text"
                  value={editInstagram}
                  onChange={(event) => setEditInstagram(event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-primary"
                  placeholder="@nickname"
                />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-secondary"
                >
                  Сохранить
                </button>
              </div>
            </form>
          ) : (
            <ul className="mt-3 space-y-1 text-sm text-slate-300">
              <li>Телефон: {contact.phone ? contact.phone : '—'}</li>
              <li>Telegram: {contact.telegram ? contact.telegram : '—'}</li>
              <li>Instagram: {contact.instagram ? contact.instagram : '—'}</li>
            </ul>
          )}
        </div>

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
              onChange={handleNoteChange}
              rows={3}
              maxLength={CONTACT_NOTE_LIMIT}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-primary"
              placeholder="Добавьте заметку о встрече, интересах или договорённостях..."
            />
            <div className="flex justify-end">
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
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleDeleteContact}
              className="rounded-md border border-red-500/40 px-4 py-2 text-xs font-semibold text-red-300 transition hover:border-red-400 hover:text-red-200"
            >
              Удалить контакт
            </button>
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
