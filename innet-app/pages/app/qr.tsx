'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import QRCode from 'react-qr-code';
import Layout from '../../components/Layout';
import { FactGroup, loadFactGroups } from '../../lib/storage';
import {
  generateShareToken,
  getOrCreateProfileId,
  mergeContactFromShare,
  parseShareToken,
  ShareGroup,
  SHARE_PREFIX,
} from '../../lib/share';

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

export default function QRPage() {
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
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [shareNonce, setShareNonce] = useState(0);
  const [responseNonce, setResponseNonce] = useState(0);
  const [tokenInput, setTokenInput] = useState('');

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

  useEffect(() => {
    setShareError(shareTokenInfo.error);
  }, [shareTokenInfo.error]);

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

  const handleCopy = async () => {
    if (!shareTokenInfo.token || shareTokenInfo.token === SHARE_PREFIX) return;
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setCopyState('error');
      return;
    }
    try {
      await navigator.clipboard.writeText(shareTokenInfo.token);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  };

  const handleTokenPaste = async () => {
    if (typeof window === 'undefined') return;
    try {
      const text = tokenInput.trim();
      const value = text || (await navigator.clipboard.readText());
      if (!value) return;
      let payload;
      try {
        payload = parseShareToken(value.trim());
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
      handleScan(value, payload);
      setTokenInput('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось вставить токен.';
      setScanError(message);
    }
  };

  const handleScan = (decoded: string, preParsed?: ReturnType<typeof parseShareToken>) => {
    if (!decoded) return;
    const now = Date.now();
    if (lastTokenRef.current === decoded && now - lastTokenTsRef.current < 1500) {
      return;
    }
    lastTokenRef.current = decoded;
    lastTokenTsRef.current = now;

    try {
      const payload = preParsed ?? parseShareToken(decoded.trim());
      if (payload?.owner?.id && payload.owner.id === profileId) {
        setScanError('Эй, эгоист! Сам себя в друзья не записывай 😅');
        setScanMessage(null);
        return;
      }
      const { contact, wasCreated, addedFacts } = mergeContactFromShare(payload);
      setLastContactId(contact.id);
      setScanError(null);

      if (wasCreated) {
        setScanMessage(`Контакт «${contact.name}» добавлен. Поделитесь фактами в ответ.`);
        const preferred = selectedGroups.length ? selectedGroups : groups.map((group) => group.id);
        setResponseSelection(preferred);
        setResponseNonce(Date.now());
        setResponseOpen(true);
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
        <p className="mt-1 text-sm text-slate-400">
          Покажите код с фактами друзьям или отсканируйте их, чтобы сохранить у себя. Все данные
          остаются на вашем устройстве.
        </p>

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
                  value={shareTokenInfo.token}
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
            <ShareControls
              onCopy={handleCopy}
              copyState={copyState}
              tokenInput={tokenInput}
              onTokenInput={setTokenInput}
              onPaste={handleTokenPaste}
            />
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
          token={responseToken}
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
  // Увеличенный размер: трек 56x32px, кружок 28x28px, смещение 24px
  return (
    <button
      onClick={onToggle}
      type="button"
      className={`relative h-8 w-14 rounded-full transition duration-200 ${
        active ? 'bg-primary/80' : 'bg-slate-600'
      }`}
      style={active && accentColor ? { backgroundColor: accentColor } : undefined}
    >
      <span
        className={`absolute top-1 left-0 h-7 w-7 rounded-full bg-slate-100 shadow transition-transform duration-200 ${
          active ? 'translate-x-6' : ''
        }`}
      />
    </button>
  );
}

function ShareControls({
  onCopy,
  copyState,
  tokenInput,
  onTokenInput,
  onPaste,
  compact,
}: {
  onCopy: () => void;
  copyState: 'idle' | 'copied' | 'error';
  tokenInput: string;
  onTokenInput: (value: string) => void;
  onPaste: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex w-full flex-col items-center gap-2 ${
        compact ? '' : 'sm:flex-row sm:items-center sm:justify-center'
      }`}
    >
      <button
        onClick={onCopy}
        className="w-full rounded-full bg-slate-700 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-600 sm:w-auto"
      >
        Скопировать токен
      </button>
      {!compact && (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <input
            type="text"
            value={tokenInput}
            onChange={(event) => onTokenInput(event.target.value)}
            placeholder="Вставьте токен вручную"
            className="w-full rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={onPaste}
            type="button"
            className="w-full rounded-full bg-primary px-4 py-2 text-sm font-medium text-background transition hover:bg-secondary sm:w-auto"
          >
            Вставить токен
          </button>
        </div>
      )}
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
  token,
}: {
  profile: ShareProfile;
  groups: FactGroup[];
  selection: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
  token: string;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleCopy = async () => {
    if (!token) return;
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setCopyState('error');
      return;
    }
    try {
      await navigator.clipboard.writeText(token);
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
              tokenInput=""
              onTokenInput={() => {}}
              onPaste={handleCopy}
              compact
            />
            <div className="rounded-2xl bg-slate-900 p-5 shadow-inner">
              {token ? (
                <QRCode
                  value={token}
                  fgColor="#38BDF8"
                  bgColor="#020617"
                  style={{ width: 220, height: 220 }}
                />
              ) : (
                <p className="w-48 text-center text-sm text-red-400">
                  Слишком много данных для ответа. Снимите одну из групп.
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
