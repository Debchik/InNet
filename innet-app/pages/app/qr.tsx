'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import QRCode from 'react-qr-code';
import Layout from '../../components/Layout';
import {
  FactGroup,
  loadFactGroups,
  createContact,
  createContactNote,
  loadContacts,
  saveContacts,
  CONTACT_NOTE_LIMIT,
  CONTACT_NOTE_MAX,
  ContactNote,
} from '../../lib/storage';
import {
  generateShareToken,
  getOrCreateProfileId,
  mergeContactFromShare,
  parseShareToken,
  ShareGroup,
  SHARE_PREFIX,
  buildShareUrl,
  extractShareToken,
} from '../../lib/share';
import { v4 as uuidv4 } from 'uuid';

const QRScanner = dynamic(() => import('../../components/QRScanner'), { ssr: false });

type ShareProfile = {
  name: string;
  avatar?: string;
  phone?: string;
  telegram?: string;
  instagram?: string;
};

const RESPONSE_OVERLAY_CLOSE_DELAY = 80;
const PROFILE_STORAGE_KEYS = [
  'innet_current_user_name',
  'innet_current_user_surname',
  'innet_current_user_phone',
  'innet_current_user_telegram',
  'innet_current_user_instagram',
  'innet_current_user_avatar',
];
const QR_VALUE_SAFE_LIMIT = 2953;

export default function QRPage() {
  // Удаляем groupsExpanded, группы всегда видны полностью
  const router = useRouter();
  const [groups, setGroups] = useState<FactGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [profile, setProfile] = useState<ShareProfile>(loadShareProfile);
  const [profileId, setProfileId] = useState('');
  const [mode, setMode] = useState<'generate' | 'scan'>('generate');
  const [isReady, setIsReady] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [responseOpen, setResponseOpen] = useState(false);
  const [responseSelection, setResponseSelection] = useState<string[]>([]);
  const [lastContactId, setLastContactId] = useState<string | null>(null);
  const [shareNonce, setShareNonce] = useState(0);
  const [responseNonce, setResponseNonce] = useState(0);
  const [tokenInput, setTokenInput] = useState('');
  const [manualModalOpen, setManualModalOpen] = useState(false);

  const lastTokenRef = useRef<string>('');
  const lastTokenTsRef = useRef<number>(0);

  useEffect(() => {
    setProfile(loadShareProfile());
    setProfileId(getOrCreateProfileId());
    const loadedGroups = loadFactGroups();
    setGroups(loadedGroups);
    setSelectedGroups(loadedGroups.map((group) => group.id));
    setIsReady(true);
  }, []);

  const updateProfile = useCallback(() => {
    setProfile(loadShareProfile());
  }, []);

  const updateGroups = useCallback(() => {
    setGroups(loadFactGroups());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorage = (event: StorageEvent) => {
      if (!event.key) {
        updateProfile();
        updateGroups();
        return;
      }
      if (event.key === 'innet_fact_groups') {
        updateGroups();
      }
      if (PROFILE_STORAGE_KEYS.includes(event.key)) {
        updateProfile();
      }
    };
    const handleProfileEvent = () => updateProfile();

    window.addEventListener('storage', handleStorage);
    window.addEventListener('innet-profile-updated', handleProfileEvent as EventListener);
    window.addEventListener('focus', handleProfileEvent as EventListener);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('innet-profile-updated', handleProfileEvent as EventListener);
      window.removeEventListener('focus', handleProfileEvent as EventListener);
    };
  }, [updateProfile, updateGroups]);

  useEffect(() => {
    setSelectedGroups((prev) => syncSelection(prev, groups));
    setResponseSelection((prev) => syncSelection(prev, groups));
  }, [groups]);

  const shareGroups = useMemo<ShareGroup[]>(() => {
    return groups
      .filter((group) => selectedGroups.includes(group.id))
      .map(groupToShare);
  }, [groups, selectedGroups]);

  const shareTokenInfo = useMemo(() => {
    if (!profileId) return { token: SHARE_PREFIX, error: null as string | null };
    try {
      const token = generateShareToken({
        v: 1,
        owner: {
          id: profileId,
          name: profile.name || 'Без имени',
          avatar: profile.avatar,
          phone: profile.phone,
          telegram: profile.telegram,
          instagram: profile.instagram,
        },
        groups: shareGroups,
        generatedAt: Date.now() + shareNonce,
      });
      return { token, error: null as string | null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось создать QR-код.';
      return { token: SHARE_PREFIX, error: message };
    }
  }, [profileId, profile, shareGroups, shareNonce]);

  const shareLinkInfo = useMemo(() => {
    if (!shareTokenInfo.token || shareTokenInfo.token === SHARE_PREFIX) {
      return { link: '', overflow: false };
    }
    if (!isReady && typeof window === 'undefined') {
      return { link: '', overflow: false };
    }
    const link = buildShareUrl(shareTokenInfo.token);
    return { link, overflow: link.length > QR_VALUE_SAFE_LIMIT };
  }, [shareTokenInfo.token, isReady]);

  const shareLink = shareLinkInfo.link;
  const shareOverflow = shareLinkInfo.overflow;

  useEffect(() => {
    if (shareTokenInfo.error) {
      setShareError(shareTokenInfo.error);
      return;
    }
    if (shareOverflow) {
      setShareError(
        'QR-код не помещает столько информации. Снимите часть групп или сократите факты.'
      );
      return;
    }
    setShareError(null);
  }, [shareTokenInfo.error, shareOverflow]);

  const responseGroups = useMemo<ShareGroup[]>(() => {
    return groups
      .filter((group) => responseSelection.includes(group.id))
      .map(groupToShare);
  }, [groups, responseSelection]);

  const responseToken = useMemo(() => {
    if (!responseOpen || !profileId) return '';
    try {
      return generateShareToken({
        v: 1,
        owner: {
          id: profileId,
          name: profile.name || 'Без имени',
          avatar: profile.avatar,
          phone: profile.phone,
          telegram: profile.telegram,
          instagram: profile.instagram,
        },
        groups: responseGroups,
        generatedAt: Date.now() + responseNonce,
      });
    } catch {
      return '';
    }
  }, [profileId, profile, responseGroups, responseNonce, responseOpen]);

  const responseLinkInfo = useMemo(() => {
    if (!responseToken) {
      return { link: '', overflow: false };
    }
    if (!isReady && typeof window === 'undefined') {
      return { link: '', overflow: false };
    }
    const link = buildShareUrl(responseToken);
    return { link, overflow: link.length > QR_VALUE_SAFE_LIMIT };
  }, [responseToken, isReady]);

  const responseLink = responseLinkInfo.link;
  const responseOverflow = responseLinkInfo.overflow;

  const handleTokenSubmit = async (rawInput?: string) => {
    if (typeof window === 'undefined') return;
    try {
      setScanError(null);
      setScanMessage(null);
      let source = rawInput;
      if (source != null) {
        source = source.trim();
        if (!source) {
          setScanError('Введите ссылку или токен для обмена.');
          setScanMessage(null);
          return;
        }
      } else {
        if (!navigator.clipboard) {
          setScanError('Буфер обмена недоступен. Вставьте ссылку вручную.');
          setScanMessage(null);
          return;
        }
        source = (await navigator.clipboard.readText()).trim();
        if (!source) {
          setScanError('Буфер обмена пуст. Скопируйте ссылку и попробуйте снова.');
          setScanMessage(null);
          return;
        }
      }

      const token = extractShareToken(source) ?? source.trim();
      let payload;
      try {
        payload = parseShareToken(token.trim());
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Некорректный токен.';
        setScanError(message);
        setScanMessage(null);
        return;
      }
      if (payload?.owner?.id && payload.owner.id === profileId) {
        setScanError('Эй, эгоист! Сам себя в друзья не записывай 😅');
        setScanMessage(null);
        return;
      }
      handleScan(token, payload);
      setTokenInput('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось обработать ссылку.';
      setScanError(message);
    }
  };

  const handleScan = (decoded: string, preParsed?: ReturnType<typeof parseShareToken>) => {
    if (!decoded) return;
    const normalized = preParsed ? decoded.trim() : extractShareToken(decoded) ?? decoded.trim();
    if (!normalized || !normalized.startsWith(SHARE_PREFIX)) {
      setScanError('Не удалось распознать ссылку обмена.');
      setScanMessage(null);
      return;
    }

    const now = Date.now();
    if (lastTokenRef.current === normalized && now - lastTokenTsRef.current < 1500) {
      return;
    }
    lastTokenRef.current = normalized;
    lastTokenTsRef.current = now;

    try {
      const payload = preParsed ?? parseShareToken(normalized);
      if (payload?.owner?.id && payload.owner.id === profileId) {
        setScanError('Эй, эгоист! Сам себя в друзья не записывай 😅');
        setScanMessage(null);
        return;
      }
      const { contact, wasCreated, addedFacts } = mergeContactFromShare(payload);
      setLastContactId(contact.id);
      setScanError(null);

      if (wasCreated) {
        setScanMessage(`Контакт «${contact.name}» добавлен.`);
        setResponseOpen(false);
        setLastContactId(contact.id);
        setTimeout(() => {
          router.push(`/app/contacts/${contact.id}`);
        }, RESPONSE_OVERLAY_CLOSE_DELAY);
      } else {
        if (addedFacts > 0) {
          setScanMessage(`Контакт «${contact.name}» обновлён: добавлено ${addedFacts} фактов.`);
        } else {
          setScanMessage(`Контакт «${contact.name}» уже есть, новых фактов нет.`);
        }
        router.push(`/app/contacts/${contact.id}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось прочитать QR-код.';
      setScanError(message);
      setScanMessage(null);
    }
  };

  const handleScanError = (error: unknown) => {
    if (!error) return;
    const message = error instanceof Error ? error.message : String(error);
    setScanError(message);
    setScanMessage(null);
  };

  const handleGroupToggle = (id: string) => {
    setSelectedGroups((prev) =>
      prev.includes(id) ? prev.filter((gid) => gid !== id) : [...prev, id]
    );
  };

  const handleResponseToggle = (id: string) => {
    setResponseSelection((prev) =>
      prev.includes(id) ? prev.filter((gid) => gid !== id) : [...prev, id]
    );
    setResponseNonce(Date.now());
  };

  const closeResponseModal = () => {
    setResponseOpen(false);
    if (lastContactId) {
      setTimeout(() => {
        router.push(`/app/contacts/${lastContactId}`);
      }, RESPONSE_OVERLAY_CLOSE_DELAY);
    }
  };

  const handleManualContactCreate = useCallback(
    (payload: ManualContactPayload) => {
      const trimmedName = payload.name.trim() || 'Без имени';
      const contacts = loadContacts();
      const baseContact = createContact({
        remoteId: uuidv4(),
        name: trimmedName,
        avatar: payload.avatar,
        phone: payload.phone?.trim() || undefined,
        telegram: payload.telegram?.trim() || undefined,
        instagram: payload.instagram?.trim() || undefined,
        groups: [],
      });

      if (payload.notes.length) {
        baseContact.notes = [...payload.notes];
      }

      saveContacts([baseContact, ...contacts]);
      setManualModalOpen(false);
      setScanError(null);
      setScanMessage(`Контакт «${baseContact.name}» добавлен вручную.`);
    },
    []
  );

  if (!isReady) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-10 text-gray-400">
          Загрузка...
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="text-3xl font-bold text-slate-100">QR-коды</h1>
        <div className="mt-1 flex flex-col gap-3 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
          <p>
            Покажите код с фактами друзьям или отсканируйте их, чтобы сохранить у себя. Все данные
            остаются на вашем устройстве.
          </p>
          <button
            type="button"
            onClick={() => setManualModalOpen(true)}
            className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-background transition hover:bg-secondary"
          >
            Добавить контакт
          </button>
        </div>

        <div className="mt-6 flex justify-center gap-3">
          <ModeButton active={mode === 'generate'} onClick={() => { setMode('generate'); setShareNonce(Date.now()); }}>
            Сгенерировать
          </ModeButton>
          <ModeButton active={mode === 'scan'} onClick={() => setMode('scan')}>
            Сканировать
          </ModeButton>
        </div>

        {mode === 'generate' ? (
          <section className="mx-auto mt-6 flex w-full max-w-lg flex-col items-center gap-6 rounded-2xl bg-gray-800 px-6 py-8 shadow-lg">
            {/* <ProfileSummary profile={profile} /> */}
            <div className="rounded-2xl bg-gray-900 p-5 shadow-inner">
              {shareError ? (
                <p className="max-w-xs text-center text-sm text-red-400">{shareError}</p>
              ) : (
                <QRCode
                  value={shareLink || SHARE_PREFIX}
                  fgColor="#0D9488"
                  bgColor="#0F172A"
                  style={{ width: 240, height: 240 }}
                />
              )}
            </div>

            <div className="w-full space-y-3">
              <h2 className="text-center text-lg font-semibold text-slate-100">
                Чем вы хотите поделиться
              </h2>
              <ul className="space-y-3">
                {groups.length === 0 && (
                  <li className="rounded-xl border border-dashed border-slate-700 px-4 py-5 text-center text-sm text-slate-400">
                    У вас пока нет групп фактов. Добавьте их в разделе «Мои факты».
                  </li>
                )}
                {groups.map((group) => {
                  const active = selectedGroups.includes(group.id);
                  return (
                    <li
                      key={group.id}
                      className="flex items-center justify-between rounded-xl bg-gray-900/70 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-slate-100" style={{ color: active ? group.color : undefined }}>
                          {group.name}
                        </p>
                        <p className="text-xs text-slate-400">Фактов: {group.facts.length}</p>
                      </div>
                      <ToggleBar
                        active={active}
                        onToggle={() => handleGroupToggle(group.id)}
                        accentColor={group.color}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ) : (
          <section className="mx-auto mt-6 flex w-full max-w-lg flex-col items-center gap-4 rounded-2xl bg-gray-800 px-6 py-8 shadow-lg">
            <QRScanner onScan={handleScan} onError={handleScanError} />
            {scanError && (
              <p className="text-center text-sm text-red-400 max-w-xs">{scanError}</p>
            )}
            {scanMessage && !scanError && (
              <p className="text-center text-sm text-green-400 max-w-xs">{scanMessage}</p>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleTokenSubmit(tokenInput);
              }}
              className="w-full space-y-2 rounded-xl border border-slate-700 bg-slate-900/40 p-4"
            >
              <label className="block text-xs text-slate-400">
                Если QR не считывается, вставьте ссылку вручную
              </label>
              <input
                type="text"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                placeholder="https://innet.app/share?..."
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/40"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-secondary"
                >
                  Сканировать ссылку
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="mx-auto mt-8 rounded-2xl bg-gray-800 px-6 py-5 text-sm text-slate-300 shadow">
          <h2 className="text-lg font-semibold text-slate-100">Как проходит обмен</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>Выберите группы, покажите QR-код собеседнику.</li>
            <li>Отсканируйте его код — факты появятся у вас локально.</li>
            <li>Сразу откроется окно с ответным QR, чтобы поделиться в ответ.</li>
            <li>После закрытия окна откроется профиль нового контакта с заметками.</li>
          </ol>
          <p className="mt-3 text-xs text-slate-500">
            Очистка данных сайта или смена браузера удалит сохранённые факты и заметки.
          </p>
        </section>
      </div>

      {responseOpen && (
        <ResponseModal
          profile={profile}
          groups={groups}
          selection={responseSelection}
          onToggle={handleResponseToggle}
          onClose={closeResponseModal}
          link={responseLink}
          overflow={responseOverflow}
        />
      )}
      {manualModalOpen && (
        <ManualContactModal
          onClose={() => setManualModalOpen(false)}
          onCreate={handleManualContactCreate}
        />
      )}
    </Layout>
  );
}

function groupToShare(group: FactGroup): ShareGroup {
  return {
    id: group.id,
    name: group.name,
    color: group.color,
    facts: group.facts.map((fact) => ({
      id: fact.id,
      text: fact.text,
    })),
  };
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm transition-colors ${
        active ? 'bg-primary text-background' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`}
    >
      {children}
    </button>
  );
}

function ToggleBar({
  active,
  onToggle,
  accentColor,
}: {
  active: boolean;
  onToggle: () => void;
  accentColor?: string;
}) {
  // Трек 56x32px, кружок 28x28px, смещение 28px, кружок всегда по центру
  return (
    <button
      onClick={onToggle}
      type="button"
      className={`flex items-center h-8 w-14 rounded-full transition duration-200 px-1 ${
        active ? 'bg-primary/80' : 'bg-slate-600'
      }`}
      style={active && accentColor ? { backgroundColor: accentColor } : undefined}
    >
      <span
        className={`h-7 w-7 rounded-full bg-slate-100 shadow transition-transform duration-200 ${
          active ? 'translate-x-6' : ''
        }`}
        style={{ transform: active ? 'translateX(24px)' : 'translateX(0)' }}
      />
    </button>
  );
}

function ShareControls({
  onCopy,
  copyState,
  copyDisabled,
}: {
  onCopy: () => void;
  copyState: 'idle' | 'copied' | 'error';
  copyDisabled?: boolean;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-2 sm:flex-row sm:items-center sm:justify-center">
      <button
        onClick={onCopy}
        disabled={copyDisabled}
        className={`w-full rounded-full px-4 py-2 text-sm text-slate-100 transition sm:w-auto ${
          copyDisabled
            ? 'bg-slate-700/60 cursor-not-allowed opacity-60'
            : 'bg-slate-700 hover:bg-slate-600'
        }`}
      >
        Скопировать ссылку
      </button>
      {copyState === 'copied' && (
        <span className="text-xs text-green-400 sm:ml-2">Скопировано</span>
      )}
      {copyState === 'error' && (
        <span className="text-xs text-red-400 sm:ml-2">Не удалось скопировать</span>
      )}
    </div>
  );
}

function ProfileSummary({ profile }: { profile: ShareProfile }) {
  const hasContacts = profile.phone || profile.telegram || profile.instagram;
  return (
    <div className="flex w-full flex-col items-center gap-3 text-center">
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-xl font-semibold text-slate-100">
        {profile.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar} alt={profile.name} className="h-full w-full object-cover" />
        ) : (
          (profile.name || 'Вы').charAt(0).toUpperCase()
        )}
      </div>
      <div>
        <p className="text-lg font-semibold text-slate-100">{profile.name || 'Вы'}</p>
        {hasContacts && (
          <div className="mt-1 space-y-1 text-xs text-slate-400">
            {profile.phone && <p>Телефон: {profile.phone}</p>}
            {profile.telegram && <p>Telegram: {profile.telegram}</p>}
            {profile.instagram && <p>Instagram: {profile.instagram}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function ResponseModal({
  profile,
  groups,
  selection,
  onToggle,
  onClose,
  link,
  overflow,
}: {
  profile: ShareProfile;
  groups: FactGroup[];
  selection: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
  link: string;
  overflow: boolean;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleCopy = async () => {
    if (!link) return;
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setCopyState('error');
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-sm text-slate-400 transition hover:text-slate-200"
        >
          Закрыть
        </button>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-xl font-semibold text-slate-100">Ответьте своими фактами</h3>
            <p className="mt-1 text-sm text-slate-400">
              Отметьте группы, которыми хотите поделиться. Код обновляется после переключения.
            </p>
            <ul className="mt-4 space-y-3">
              {groups.length === 0 && (
                <li className="rounded-xl border border-dashed border-slate-700 px-4 py-5 text-sm text-slate-500">
                  Добавьте хотя бы одну группу фактов, чтобы делиться ими.
                </li>
              )}
              {groups.map((group) => {
                const active = selection.includes(group.id);
                return (
                  <li
                    key={group.id}
                    className="flex items-center justify-between rounded-xl bg-slate-900/70 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-slate-100" style={{ color: active ? group.color : undefined }}>
                        {group.name}
                      </p>
                      <p className="text-xs text-slate-400">Фактов: {group.facts.length}</p>
                    </div>
                    <ToggleBar
                      active={active}
                      onToggle={() => onToggle(group.id)}
                      accentColor={group.color}
                    />
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-col items-center gap-3">
            <ProfileSummary profile={profile} />
            <ShareControls
              onCopy={handleCopy}
              copyState={copyState}
              copyDisabled={!link}
            />
            <div className="rounded-2xl bg-slate-900 p-5 shadow-inner">
              {link && !overflow ? (
                <QRCode
                  value={link}
                  fgColor="#38BDF8"
                  bgColor="#020617"
                  style={{ width: 220, height: 220 }}
                />
              ) : overflow ? (
                <p className="w-48 text-center text-sm text-red-400">
                  Слишком много данных для ответа. Снимите одну из групп или сократите факты.
                </p>
              ) : (
                <p className="w-48 text-center text-sm text-slate-400">
                  Выберите хотя бы одну группу, чтобы сформировать ответный QR-код.
                </p>
              )}
            </div>
            <p className="text-center text-xs text-slate-500">
              Покажите код собеседнику и закройте окно, когда он его отсканирует.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function loadShareProfile(): ShareProfile {
  if (typeof window === 'undefined') {
    return { name: 'Вы' };
  }
  const name = (localStorage.getItem('innet_current_user_name') ?? '').trim();
  const surname = (localStorage.getItem('innet_current_user_surname') ?? '').trim();
  const fullName = [name, surname].filter(Boolean).join(' ').trim() || 'Вы';
  return {
    name: fullName,
    avatar: cleanValue(localStorage.getItem('innet_current_user_avatar')),
    phone: cleanValue(localStorage.getItem('innet_current_user_phone')),
    telegram: cleanHandle(localStorage.getItem('innet_current_user_telegram')),
    instagram: cleanHandle(localStorage.getItem('innet_current_user_instagram')),
  };
}

function cleanValue(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function cleanHandle(value: string | null): string | undefined {
  const cleaned = cleanValue(value);
  if (!cleaned) return undefined;
  return cleaned.startsWith('@') ? cleaned : `@${cleaned.replace(/^@+/, '')}`;
}

function syncSelection(current: string[], source: FactGroup[]): string[] {
  const ids = source.map((group) => group.id);
  if (!current.length) return ids;
  const merged = current.filter((id) => ids.includes(id));
  ids.forEach((id) => {
    if (!merged.includes(id)) merged.push(id);
  });
  return merged;
}

type ManualContactPayload = {
  name: string;
  phone: string;
  telegram: string;
  instagram: string;
  notes: ContactNote[];
  avatar: string | undefined;
};

function ManualContactModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (payload: ManualContactPayload) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [instagram, setInstagram] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      stopCameraStream(streamRef.current);
    };
  }, []);

  const generatedAvatar = useMemo(() => generateColorAvatar(name), [name]);
  const previewAvatar = avatar ?? generatedAvatar;

  const handleAddNote = () => {
    const trimmed = noteDraft.trim();
    if (!trimmed) {
      setNoteError('Сначала введите текст заметки.');
      return;
    }
    if (notes.length >= CONTACT_NOTE_MAX) {
      setNoteError('Достигнут лимит заметок. Удалите одну, чтобы добавить новую.');
      return;
    }
    const note = createContactNote(trimmed);
    setNotes((prev) => [note, ...prev]);
    setNoteDraft('');
    setNoteError(null);
  };

  const handleRemoveNote = (noteId: string) => {
    setNotes((prev) => prev.filter((item) => item.id !== noteId));
  };

  const openCamera = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Камера не поддерживается в этом браузере.');
      setCameraOpen(true);
      return;
    }
    try {
      setCameraReady(false);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'user' },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;
        video.playsInline = true;
        const handleReady = () => {
          setCameraReady(true);
          video.removeEventListener('loadedmetadata', handleReady);
          video.removeEventListener('canplay', handleReady);
        };
        video.addEventListener('loadedmetadata', handleReady);
        video.addEventListener('canplay', handleReady);
        if (video.readyState >= 2 && video.videoWidth > 0) {
          handleReady();
        }
        const playVideo = () => {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => undefined);
          }
        };
        if (video.readyState >= 2) {
          playVideo();
        } else {
          const handleLoaded = () => {
            playVideo();
            video.removeEventListener('loadedmetadata', handleLoaded);
          };
          video.addEventListener('loadedmetadata', handleLoaded);
        }
      }
      setCameraError(null);
      setCameraOpen(true);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Не удалось получить доступ к камере. Проверьте разрешения.';
      setCameraError(message);
      setCameraOpen(true);
    }
  };

  const closeCamera = () => {
    stopCameraStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
    setCameraError(null);
    setCameraReady(false);
  };

  const retryCamera = () => {
    closeCamera();
    void openCamera();
  };

  const captureSelfie = () => {
    const video = videoRef.current;
    if (!cameraReady || !video || !video.videoWidth || !video.videoHeight) {
      setCameraError('Камера ещё не готова. Подождите секунду и попробуйте снова.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setCameraError('Не удалось сделать снимок.');
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    setAvatar(dataUrl);
    closeCamera();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Укажите имя контакта.');
      return;
    }
    setError(null);
    onCreate({
      name: trimmedName,
      phone,
      telegram,
      instagram,
      notes,
      avatar: previewAvatar,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-100">Добавить контакт вручную</h2>
          <button
            type="button"
            onClick={() => {
              closeCamera();
              onClose();
            }}
            className="text-sm text-slate-400 transition hover:text-slate-200"
          >
            Закрыть
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-5 grid gap-6 md:grid-cols-[160px,1fr]">
          <div className="flex flex-col items-center gap-4">
            <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewAvatar}
                alt={name || 'Новый контакт'}
                className="h-full w-full object-cover"
              />
            </div>
            <button
              type="button"
              onClick={() => void openCamera()}
              className="w-full rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:border-primary hover:bg-primary/15"
            >
              Сделать селфи
            </button>
            <button
              type="button"
              onClick={() => setAvatar(undefined)}
              className="text-xs text-slate-400 transition hover:text-slate-200"
            >
              Сбросить фото
            </button>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm text-slate-300">
                Имя <span className="text-primary">*</span>
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/40"
                placeholder="Имя контакта"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm text-slate-300">Телефон</label>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/40"
                  placeholder="+7 (999) 123-45-67"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm text-slate-300">Telegram</label>
                <input
                  value={telegram}
                  onChange={(event) => setTelegram(event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/40"
                  placeholder="@nickname"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm text-slate-300">Instagram</label>
                <input
                  value={instagram}
                  onChange={(event) => setInstagram(event.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/40"
                  placeholder="@username"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="block text-sm text-slate-300">Заметки</label>
                <div className="space-y-2">
                  <textarea
                    value={noteDraft}
                    onChange={(event) => {
                      setNoteDraft(event.target.value.slice(0, CONTACT_NOTE_LIMIT));
                      setNoteError(null);
                    }}
                    rows={3}
                    maxLength={CONTACT_NOTE_LIMIT}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/40"
                    placeholder="Где познакомились, что обсудили..."
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-400">
                    <span>
                      {noteDraft.length}/{CONTACT_NOTE_LIMIT}
                    </span>
                    <button
                      type="button"
                      onClick={handleAddNote}
                      className="rounded-full border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-primary hover:text-primary"
                    >
                      Добавить заметку
                    </button>
                  </div>
                </div>
                {noteError && <p className="text-xs text-red-400">{noteError}</p>}
                {notes.length > 0 && (
                  <ul className="space-y-2">
                    {notes.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start justify-between rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                      >
                        <div>
                          <p>{item.text}</p>
                          <p className="mt-1 text-xs text-slate-500">Заметка сохранится после добавления контакта</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveNote(item.id)}
                          className="ml-3 text-xs text-red-400 transition hover:text-red-300"
                        >
                          удалить
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  closeCamera();
                  onClose();
                }}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-primary hover:text-primary"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-secondary"
              >
                Сохранить контакт
              </button>
            </div>
          </div>
        </form>

        {cameraOpen && (
          <CameraOverlay
            videoRef={videoRef}
            error={cameraError}
            ready={cameraReady}
            onClose={closeCamera}
            onCapture={captureSelfie}
            onRetry={retryCamera}
          />
        )}
      </div>
    </div>
  );
}

function CameraOverlay({
  videoRef,
  error,
  ready,
  onClose,
  onCapture,
  onRetry,
}: {
  videoRef: RefObject<HTMLVideoElement>;
  error: string | null;
  ready: boolean;
  onClose: () => void;
  onCapture: () => void;
  onRetry: () => void;
}) {
  const hasError = Boolean(error);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-lg">
        <h3 className="text-lg font-semibold">Сделать селфи</h3>
        <div className="relative mt-4 overflow-hidden rounded-lg border border-slate-700 bg-black">
          <video
            ref={videoRef}
            className="h-64 w-full object-cover"
            autoPlay
            playsInline
            muted
          />
          {hasError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-4 py-6 text-center text-sm text-red-300">
              <p>{error}</p>
            </div>
          )}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {hasError ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-primary hover:text-primary"
              >
                Закрыть
              </button>
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-secondary"
              >
                Попробовать снова
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-primary hover:text-primary"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={onCapture}
                disabled={!ready}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                  ready
                    ? 'bg-primary text-slate-950 hover:bg-secondary'
                    : 'cursor-not-allowed bg-slate-700 text-slate-400'
                }`}
              >
                Сделать снимок
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function stopCameraStream(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  });
}

function generateColorAvatar(seed: string): string {
  const value = seed || 'contact';
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  const colorA = `hsl(${hue}, 70%, 55%)`;
  const colorB = `hsl(${(hue + 40) % 360}, 70%, 45%)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${colorA}" />
        <stop offset="100%" stop-color="${colorB}" />
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="80" ry="80" fill="url(#g)" />
  </svg>`;
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

function toBase64(input: string): string {
  if (typeof window === 'undefined') {
    return Buffer.from(input, 'utf8').toString('base64');
  }
  return window.btoa(input);
}
