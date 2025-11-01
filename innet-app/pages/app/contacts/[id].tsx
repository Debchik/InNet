import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import Layout from '../../../components/Layout';
import {
  Contact,
  CONTACT_NOTE_LIMIT,
  CONTACT_NOTE_MAX,
  CONTACT_TAG_COLOR_PRESETS,
  createContactNote,
  createContactTag,
  loadContacts,
  loadFactGroups,
  saveContacts,
  updateContact,
} from '../../../lib/storage';
import { formatRelative } from '../../../utils/time';
import Link from 'next/link';
import { usePlan } from '../../../hooks/usePlan';
import { buildAiSuggestions } from '../../../lib/assistant';

const withAlpha = (hex: string, alpha: number) => {
  if (!hex || !hex.startsWith('#')) return hex;
  const value = hex.replace('#', '');
  const base = value.slice(0, 6);
  const alphaHex = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${base}${alphaHex}`;
};

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
  const { entitlements } = usePlan();
  const [copiedSuggestionId, setCopiedSuggestionId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const copyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const allowCustomTags = entitlements.allowCustomTags;
  const [tagLabel, setTagLabel] = useState('');
  const [tagColor, setTagColor] = useState<string>(CONTACT_TAG_COLOR_PRESETS[0]);
  const [tagError, setTagError] = useState<string | null>(null);
  const [tagMessage, setTagMessage] = useState<string | null>(null);

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
    setTagLabel('');
    setTagColor(contact.tags[0]?.color ?? CONTACT_TAG_COLOR_PRESETS[0]);
    setTagError(null);
    setTagMessage(null);
  }, [contact]);

  useEffect(() => {
    setCopiedSuggestionId(null);
  }, [contact?.id]);

  useEffect(() => () => {
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!tagMessage) return;
    const timer = setTimeout(() => setTagMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [tagMessage]);

  const knownGroups = useMemo(() => loadFactGroups(), []);
  const aiSuggestions = useMemo(
    () => (contact && entitlements.allowAiSuggestions ? buildAiSuggestions(contact) : []),
    [contact, entitlements.allowAiSuggestions]
  );

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

  const handleAddTag = () => {
    if (!contact || !allowCustomTags) return;
    const label = tagLabel.trim();
    if (!label) {
      setTagError('Введите название тега');
      return;
    }
    if (label.length > 32) {
      setTagError('Максимум 32 символа');
      return;
    }
    if (contact.tags.some((tag) => tag.label.toLowerCase() === label.toLowerCase())) {
      setTagError('Такой тег уже есть');
      return;
    }
    if (contact.tags.length >= 12) {
      setTagError('Можно добавить до 12 тегов');
      return;
    }

    setTagError(null);
    const newTag = createContactTag(label, tagColor);
    const updated: Contact = {
      ...contact,
      tags: [newTag, ...contact.tags],
      lastUpdated: Date.now(),
    };
    updateContact(updated);
    setContact(updated);
    setTagLabel('');
    setTagMessage('Тег добавлен');
  };

  const handleRemoveTag = (tagId: string) => {
    if (!contact || !allowCustomTags) return;
    const updated: Contact = {
      ...contact,
      tags: contact.tags.filter((tag) => tag.id !== tagId),
      lastUpdated: Date.now(),
    };
    updateContact(updated);
    setContact(updated);
    setTagMessage(null);
  };

  const handleCopySuggestion = useCallback(
    async (suggestionId: string, text: string) => {
      if (!text) return;
      setAiError(null);
      try {
        if (!navigator?.clipboard?.writeText) {
          throw new Error('Clipboard API unavailable');
        }
        await navigator.clipboard.writeText(text);
        setCopiedSuggestionId(suggestionId);
        if (copyTimerRef.current) {
          clearTimeout(copyTimerRef.current);
        }
        copyTimerRef.current = setTimeout(() => {
          setCopiedSuggestionId(null);
          copyTimerRef.current = null;
        }, 2500);
      } catch (error) {
        console.warn('[contact] Failed to copy suggestion', error);
        setAiError('Не удалось скопировать текст. Выделите и скопируйте его вручную.');
      }
    },
    []
  );

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

        <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/70 p-5 shadow">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold text-slate-100">Теги контакта</h2>
            {!allowCustomTags && (
              <p className="text-xs text-slate-500">
                Доступно в InNet Pro: отмечайте людей как «семья», «друг», «коллега» и подсвечивайте их цветом.
              </p>
            )}
          </div>
          {contact.tags.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              {allowCustomTags
                ? 'Добавьте первый тег, чтобы выделить роль этого контакта.'
                : 'Теги появятся после подключения подписки Pro.'}
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {contact.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
                  style={{
                    borderColor: withAlpha(tag.color, 0.6),
                    backgroundColor: withAlpha(tag.color, 0.16),
                    color: tag.color,
                  }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.label}
                  {allowCustomTags && (
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag.id)}
                      className="ml-1 text-[10px] uppercase tracking-wide text-slate-400 hover:text-slate-100"
                      aria-label={`Удалить тег ${tag.label}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          {allowCustomTags && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleAddTag();
              }}
              className="mt-4 space-y-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <input
                  type="text"
                  value={tagLabel}
                  onChange={(event) => {
                    setTagLabel(event.target.value);
                    setTagError(null);
                    setTagMessage(null);
                  }}
                  placeholder="Например, коллега"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-primary"
                />
                <button
                  type="submit"
                  className="w-full sm:w-auto rounded-full bg-primary px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-secondary"
                >
                  Добавить тег
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {CONTACT_TAG_COLOR_PRESETS.map((colorOption) => {
                  const active = colorOption === tagColor;
                  return (
                    <button
                      key={colorOption}
                      type="button"
                      onClick={() => {
                        setTagColor(colorOption);
                        setTagMessage(null);
                      }}
                      className={`h-8 w-8 rounded-full border-2 transition ${
                        active ? 'border-white shadow-[0_0_0_3px_rgba(255,255,255,0.25)]' : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: colorOption }}
                      aria-label={`Выбрать цвет ${colorOption}`}
                    />
                  );
                })}
              </div>
              {tagError && <p className="text-xs text-red-400">{tagError}</p>}
              {tagMessage && <p className="text-xs text-emerald-300">{tagMessage}</p>}
            </form>
          )}
        </section>

        {entitlements.allowAiSuggestions ? (
          <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/70 p-5 shadow">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">ИИ-помощник</h2>
                <p className="text-sm text-slate-400">
                  Подсказывает, что написать контакту или как позвать на встречу. Выберите вариант и
                  скопируйте текст одним нажатием.
                </p>
              </div>
            </div>
            {aiError && <p className="mt-3 text-xs text-red-400">{aiError}</p>}
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {aiSuggestions.map((suggestion) => (
                <article
                  key={suggestion.id}
                  className="flex flex-col justify-between rounded-lg border border-slate-800 bg-slate-950/70 p-4"
                >
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      {suggestion.title}
                    </p>
                    <p className="mt-2 text-sm text-slate-200 whitespace-pre-wrap">
                      {suggestion.text}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopySuggestion(suggestion.id, suggestion.text)}
                    className={`mt-4 inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold transition ${
                      copiedSuggestionId === suggestion.id
                        ? 'bg-emerald-400/20 text-emerald-200'
                        : 'border border-slate-700 text-slate-200 hover:border-primary hover:text-primary'
                    }`}
                  >
                    {copiedSuggestionId === suggestion.id ? 'Скопировано' : 'Скопировать текст'}
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-xl font-semibold text-slate-100">ИИ-помощник</h2>
            <p className="mt-2 text-sm text-slate-400">
              ИИ-подсказки доступны в подписке InNet Pro. Получайте персональные идеи для сообщений и
              встреч в один клик.
            </p>
            <Link
              href="/register?plan=pro"
              className="mt-4 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-semibold text-slate-900 transition hover:bg-secondary"
            >
              Оформить InNet Pro
            </Link>
          </section>
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
