'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import { useRouter } from 'next/router';
import QRCode from 'react-qr-code';
import Layout from '../../components/Layout';
import ToggleBar from '../../components/ToggleBar';
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
  ShareGroup,
  SHARE_PREFIX,
  buildShareUrl,
} from '../../lib/share';
import { fetchPendingExchanges } from '../../lib/exchangeClient';
import { v4 as uuidv4 } from 'uuid';
import { usePlan } from '../../hooks/usePlan';
import { usePrivacy } from '../../hooks/usePrivacy';
import { isUnlimited } from '../../lib/plans';
import { ShareProfile, loadShareProfile, SHARE_PROFILE_STORAGE_KEYS } from '../../lib/shareProfile';
import { groupToShare, syncSelection } from '../../lib/shareUtils';
import { createShareAliasLink } from '../../lib/shareAliasClient';
import { spendTokensForAction } from '../../lib/tokens';

const RESPONSE_OVERLAY_CLOSE_DELAY = 80;
const EXCHANGE_POLL_INTERVAL = 5000;
const QR_VALUE_SAFE_LIMIT = 2953;

type LinkState = {
  link: string;
  overflow: boolean;
  pending: boolean;
};

type ManualNotice = {
  type: 'success' | 'error';
  message: string;
};

export default function QRPage() {
  // Удаляем groupsExpanded, группы всегда видны полностью
  const router = useRouter();
  const [groups, setGroups] = useState<FactGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [profile, setProfile] = useState<ShareProfile>(loadShareProfile);
  const [profileId, setProfileId] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [responseOpen, setResponseOpen] = useState(false);
  const [responseSelection, setResponseSelection] = useState<string[]>([]);
  const [lastContactId, setLastContactId] = useState<string | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualNotice, setManualNotice] = useState<ManualNotice | null>(null);
  const [incomingExchange, setIncomingExchange] = useState<{
    contactId: string;
    message: string;
  } | null>(null);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [shareLinkState, setShareLinkState] = useState<LinkState>({
    link: '',
    overflow: false,
    pending: false,
  });
  const [responseLinkState, setResponseLinkState] = useState<LinkState>({
    link: '',
    overflow: false,
    pending: false,
  });
  const { entitlements } = usePlan();
  const { level: privacyLevel } = usePrivacy(entitlements);
  const [contacts, setContacts] = useState(loadContacts());
  const isContactLimitExceeded = useCallback(
    (remoteId?: string) => {
      if (isUnlimited(entitlements.contactLimit)) return false;
      const limit = entitlements.contactLimit ?? 0;
      if (limit <= 0) return true;
      if (remoteId) {
        const exists = contacts.some((contact) => contact.remoteId === remoteId);
        if (exists) {
          return false;
        }
      }
      return contacts.length >= limit;
    },
    [contacts, entitlements.contactLimit]
  );

  const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setProfile(loadShareProfile());
    setProfileId(getOrCreateProfileId());
    const loadedGroups = loadFactGroups();
    setGroups(loadedGroups);
    setSelectedGroups(loadedGroups.map((group) => group.id));
    setContacts(loadContacts());
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
        setContacts(loadContacts());
        return;
      }
      if (event.key === 'innet_fact_groups') {
        updateGroups();
      }
      if (event.key === 'innet_contacts') {
        setContacts(loadContacts());
      }
      if (event.key && SHARE_PROFILE_STORAGE_KEYS.includes(event.key)) {
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

  const ownerContact = useMemo(
    () => ({
      phone: privacyLevel === 'direct-only' ? undefined : profile.phone,
      telegram: privacyLevel === 'direct-only' ? undefined : profile.telegram,
      instagram: privacyLevel === 'direct-only' ? undefined : profile.instagram,
    }),
    [privacyLevel, profile.instagram, profile.phone, profile.telegram]
  );

  const sharePayloadSignature = useMemo(() => {
    const normalizedGroups = shareGroups.map((group) => ({
      id: group.id,
      name: group.name,
      color: group.color,
      facts: group.facts.map((fact) => `${fact.id}:${fact.text}`),
    }));
    return JSON.stringify({
      profileId,
      name: profile.name ?? '',
      avatar: profile.avatar ?? '',
      phone: ownerContact.phone ?? '',
      telegram: ownerContact.telegram ?? '',
      instagram: ownerContact.instagram ?? '',
      privacy: privacyLevel,
      groups: normalizedGroups,
    });
  }, [
    profileId,
    profile.name,
    profile.avatar,
    ownerContact.phone,
    ownerContact.telegram,
    ownerContact.instagram,
    privacyLevel,
    shareGroups,
  ]);

  const shareGeneratedAt = useMemo(() => Date.now(), [sharePayloadSignature]);

  const shareTokenInfo = useMemo(() => {
    if (!profileId) return { token: SHARE_PREFIX, error: null as string | null };
    try {
      const token = generateShareToken({
        v: 1,
        owner: {
          id: profileId,
          name: profile.name || 'Без имени',
          avatar: profile.avatar,
          phone: ownerContact.phone,
          telegram: ownerContact.telegram,
          instagram: ownerContact.instagram,
        },
        groups: shareGroups,
        generatedAt: shareGeneratedAt,
        privacy: privacyLevel,
      });
      return { token, error: null as string | null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось создать QR-код.';
      return { token: SHARE_PREFIX, error: message };
    }
  }, [profileId, profile, shareGroups, ownerContact, privacyLevel, shareGeneratedAt]);

  useEffect(() => {
    if (!shareTokenInfo.token || shareTokenInfo.token === SHARE_PREFIX) {
      setShareLinkState({ link: '', overflow: false, pending: false });
      return;
    }
    if (!isReady && typeof window === 'undefined') {
      setShareLinkState({ link: '', overflow: false, pending: false });
      return;
    }
    let cancelled = false;
    const fallbackLink = buildShareUrl(shareTokenInfo.token);
    const fallbackOverflow = fallbackLink.length > QR_VALUE_SAFE_LIMIT;
    setShareLinkState({ link: fallbackLink, overflow: fallbackOverflow, pending: true });

    void (async () => {
      try {
        const { url } = await createShareAliasLink(shareTokenInfo.token);
        if (cancelled) return;
        setShareLinkState({ link: url, overflow: url.length > QR_VALUE_SAFE_LIMIT, pending: false });
      } catch (err) {
        if (cancelled) return;
        console.warn('[qr] Failed to create share alias', err);
        setShareLinkState({ link: fallbackLink, overflow: fallbackOverflow, pending: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shareTokenInfo.token, isReady]);

  useEffect(() => {
    if (shareTokenInfo.error) {
      setShareError(shareTokenInfo.error);
      return;
    }
    if (shareLinkState.overflow) {
      setShareError(
        'QR-код не помещает столько информации. Снимите часть групп или сократите факты.'
      );
      return;
    }
    setShareError(null);
  }, [shareTokenInfo.error, shareLinkState.overflow]);

  const responseGroups = useMemo<ShareGroup[]>(() => {
    return groups
      .filter((group) => responseSelection.includes(group.id))
      .map(groupToShare);
  }, [groups, responseSelection]);

  const responsePayloadSignature = useMemo(() => {
    const normalizedGroups = responseGroups.map((group) => ({
      id: group.id,
      name: group.name,
      color: group.color,
      facts: group.facts.map((fact) => `${fact.id}:${fact.text}`),
    }));
    return JSON.stringify({
      profileId,
      active: responseOpen,
      name: profile.name ?? '',
      avatar: profile.avatar ?? '',
      phone: profile.phone ?? '',
      telegram: profile.telegram ?? '',
      instagram: profile.instagram ?? '',
      groups: normalizedGroups,
    });
  }, [
    profileId,
    profile.name,
    profile.avatar,
    profile.phone,
    profile.telegram,
    profile.instagram,
    responseGroups,
    responseOpen,
  ]);

  const responseGeneratedAt = useMemo(() => Date.now(), [responsePayloadSignature]);

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
        generatedAt: responseGeneratedAt,
      });
    } catch {
      return '';
    }
  }, [profileId, profile, responseGroups, responseGeneratedAt, responseOpen]);

  useEffect(() => {
    if (!responseToken || !responseOpen) {
      setResponseLinkState({ link: '', overflow: false, pending: false });
      return;
    }
    if (!isReady && typeof window === 'undefined') {
      setResponseLinkState({ link: '', overflow: false, pending: false });
      return;
    }
    let cancelled = false;
    const fallbackLink = buildShareUrl(responseToken);
    const fallbackOverflow = fallbackLink.length > QR_VALUE_SAFE_LIMIT;
    setResponseLinkState({ link: fallbackLink, overflow: fallbackOverflow, pending: true });

    void (async () => {
      try {
        const { url } = await createShareAliasLink(responseToken);
        if (cancelled) return;
        setResponseLinkState({ link: url, overflow: url.length > QR_VALUE_SAFE_LIMIT, pending: false });
      } catch (err) {
        if (cancelled) return;
        console.warn('[qr] Failed to create response alias', err);
        setResponseLinkState({ link: fallbackLink, overflow: fallbackOverflow, pending: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [responseToken, responseOpen, isReady]);

  useEffect(() => {
    if (!incomingExchange) return;
    if (incomingTimerRef.current) {
      clearTimeout(incomingTimerRef.current);
    }
    incomingTimerRef.current = setTimeout(() => {
      setIncomingExchange(null);
      if (incomingTimerRef.current) {
        clearTimeout(incomingTimerRef.current);
        incomingTimerRef.current = null;
      }
    }, 6000);

    return () => {
      if (incomingTimerRef.current) {
        clearTimeout(incomingTimerRef.current);
        incomingTimerRef.current = null;
      }
    };
  }, [incomingExchange]);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let fetching = false;

    const fetchPending = async () => {
      if (fetching || cancelled) return;
      fetching = true;
      try {
        const result = await fetchPendingExchanges(profileId);
        if (cancelled || !result) return;

        if (result.ok) {
          let limitBlocked = false;
          if (result.exchanges.length > 0) {
            for (const exchange of result.exchanges) {
              try {
                let tokenMessage: string | null = null;
                if (isContactLimitExceeded(exchange.payload.owner?.id)) {
                  const charge = spendTokensForAction('extra-contact');
                  if (!charge.ok) {
                    setExchangeError(
                      `Недостаточно токенов, чтобы добавить новый контакт. Нужно ${charge.cost}, на балансе ${charge.balance}.`
                    );
                    limitBlocked = true;
                    continue;
                  }
                  tokenMessage = `Списано ${charge.cost} токенов. Остаток: ${charge.balance}.`;
                }
                const outcome = mergeContactFromShare(exchange.payload);
                setContacts(loadContacts());
                setLastContactId(outcome.contact.id);
                const message = outcome.wasCreated
                  ? `Контакт «${outcome.contact.name}» добавлен автоматически.`
                  : outcome.addedFacts > 0
                    ? `Контакт «${outcome.contact.name}» обновлён: добавлено ${outcome.addedFacts} фактов.`
                    : `Контакт «${outcome.contact.name}» уже есть в списке.`;
                const combinedMessage = tokenMessage ? `${tokenMessage} ${message}` : message;
                setIncomingExchange({ contactId: outcome.contact.id, message: combinedMessage });
              } catch (err) {
                console.error('[qr] Failed to merge incoming exchange', err);
              }
            }
          }
          if (!limitBlocked) {
            setExchangeError(null);
          }
        } else {
          setExchangeError(result.message);
        }
      } catch (error) {
        if (cancelled) return;
        console.warn('[qr] fetchPendingExchanges crashed', error);
        setExchangeError('Не удалось получить обмены с сервера.');
      } finally {
        fetching = false;
      }
    };

    const schedule = () => {
      if (cancelled) return;
      timer = setTimeout(async () => {
        await fetchPending();
        schedule();
      }, EXCHANGE_POLL_INTERVAL);
    };

    void fetchPending();
    schedule();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [profileId, shareTokenInfo.token, isContactLimitExceeded]);

  const handleGroupToggle = (id: string) => {
    setSelectedGroups((prev) =>
      prev.includes(id) ? prev.filter((gid) => gid !== id) : [...prev, id]
    );
  };

  const handleResponseToggle = (id: string) => {
    setResponseSelection((prev) =>
      prev.includes(id) ? prev.filter((gid) => gid !== id) : [...prev, id]
    );
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
      let tokenMessage: string | null = null;
      if (isContactLimitExceeded()) {
        const charge = spendTokensForAction('extra-contact');
        if (!charge.ok) {
          setManualNotice({
            type: 'error',
            message: `Нужны ${charge.cost} токена(ов), на балансе ${charge.balance}. Пополните баланс во вкладке «Токены».`,
          });
          return;
        }
        tokenMessage = `Списано ${charge.cost} токенов. Остаток: ${charge.balance}.`;
      }
      const trimmedName = payload.name.trim() || 'Без имени';
      const storedContacts = loadContacts();
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

      saveContacts([baseContact, ...storedContacts]);
      setContacts(loadContacts());
      setManualModalOpen(false);
      setManualNotice({
        type: 'success',
        message: tokenMessage
          ? `${tokenMessage} Контакт «${baseContact.name}» добавлен вручную.`
          : `Контакт «${baseContact.name}» добавлен вручную.`,
      });
    },
    [isContactLimitExceeded]
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
        <h1 className="text-3xl font-bold text-slate-100">Мой QR</h1>
        <div className="mt-1 text-sm text-slate-400">
          <p>
            Покажите код с фактами друзьям или отсканируйте их, чтобы сохранить у себя. Все данные
            остаются на вашем устройстве.
          </p>
        </div>

        <section className="mx-auto mt-6 flex w-full max-w-lg flex-col items-center gap-6 rounded-2xl bg-gray-800 px-6 py-8 shadow-lg">
          {/* <ProfileSummary profile={profile} /> */}
          <div className="rounded-[28px] border border-cyan-500/20 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-800/60 p-6 shadow-[0_35px_80px_rgba(8,145,178,0.35)] backdrop-blur-xl">
            {shareError ? (
              <p className="max-w-xs text-center text-sm text-red-400">{shareError}</p>
            ) : (
              <div
                className="relative rounded-2xl bg-slate-950/40 p-4 shadow-inner"
                aria-busy={shareLinkState.pending}
              >
                <div
                  className={`transition duration-200 ${
                    shareLinkState.pending ? 'blur-sm opacity-70' : ''
                  }`}
                >
                  <QRCode
                    value={shareLinkState.link || SHARE_PREFIX}
                    fgColor="#80F2E3"
                    bgColor="transparent"
                    level="L"
                    style={{
                      width: 'min(80vw, 320px)',
                      height: 'min(80vw, 320px)',
                      filter: 'drop-shadow(0 20px 40px rgba(8,145,178,0.35))',
                    }}
                  />
                </div>
                {shareLinkState.pending && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-semibold uppercase tracking-wide text-cyan-200">
                    Готовим QR...
                  </div>
                )}
              </div>
            )}
          </div>

          {incomingExchange && (
            <div className="w-full rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
              <p>{incomingExchange.message}</p>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-slate-900 transition hover:bg-secondary"
                  onClick={() => {
                    router.push(`/app/contacts/${incomingExchange.contactId}`);
                    setIncomingExchange(null);
                  }}
                >
                  Открыть контакт
                </button>
                <button
                  type="button"
                  className="rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary/20"
                  onClick={() => setIncomingExchange(null)}
                >
                  Скрыть
                </button>
              </div>
            </div>
          )}

          {exchangeError && (
            <div className="w-full rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {exchangeError}
            </div>
          )}

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
            {manualNotice && (
              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  manualNotice.type === 'success'
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-red-500/40 bg-red-500/10 text-red-400'
                }`}
              >
                {manualNotice.message}
              </div>
            )}
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setManualNotice(null);
                  setManualModalOpen(true);
                }}
                className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-background transition hover:bg-secondary"
              >
                Добавить контакт вручную
              </button>
            </div>
          </div>
        </section>

        <section id="qr-tutorial" className="mx-auto mt-8 rounded-2xl bg-gray-800 px-6 py-5 text-sm text-slate-300 shadow">
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

      <a
        href="#qr-tutorial"
        className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-background text-xl font-semibold shadow-lg transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
        aria-label="Перейти к туториалу"
      >
        ?
      </a>

      {responseOpen && (
        <ResponseModal
          profile={profile}
          groups={groups}
          selection={responseSelection}
          onToggle={handleResponseToggle}
          onClose={closeResponseModal}
          link={responseLinkState.link}
          overflow={responseLinkState.overflow}
          pending={responseLinkState.pending}
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
  pending,
}: {
  profile: ShareProfile;
  groups: FactGroup[];
  selection: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
  link: string;
  overflow: boolean;
  pending: boolean;
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
              copyDisabled={!link || pending}
            />
            <div className="rounded-[28px] border border-sky-400/20 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-800/60 p-5 shadow-[0_30px_70px_rgba(14,165,233,0.35)] backdrop-blur-xl">
              {link && !overflow ? (
                <div
                  className="relative rounded-2xl bg-slate-950/40 p-3 shadow-inner"
                  aria-busy={pending}
                >
                  <div
                    className={`transition duration-200 ${
                      pending ? 'blur-sm opacity-70' : ''
                    }`}
                  >
                    <QRCode
                      value={link}
                      fgColor="#7DD3FC"
                      bgColor="transparent"
                      level="L"
                      style={{
                        width: 'min(70vw, 280px)',
                        height: 'min(70vw, 280px)',
                        filter: 'drop-shadow(0 18px 38px rgba(15,118,230,0.35))',
                      }}
                    />
                  </div>
                  {pending && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-semibold uppercase tracking-wide text-sky-200">
                      Обновляем QR...
                    </div>
                  )}
                </div>
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
