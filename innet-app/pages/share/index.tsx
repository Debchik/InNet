'use client';

import { useRouter } from 'next/router';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../../components/Layout';
import {
  extractShareToken,
  mergeContactFromShare,
  parseShareToken,
  ShareGroup,
  SharePayload,
} from '../../lib/share';
import {
  convertFactsToGroups,
  loadContacts,
  loadUsers,
  saveFactGroups,
  saveUsers,
  UserAccount,
} from '../../lib/storage';
import { syncProfileToSupabase } from '../../lib/profileSync';
import { v4 as uuidv4 } from 'uuid';
import { usePlan } from '../../hooks/usePlan';
import { DEFAULT_PLAN, isUnlimited } from '../../lib/plans';
import { registerRemoteAccount } from '../../lib/accountRemote';

type PageStatus = 'loading' | 'ready' | 'adding' | 'added' | 'error';

type QuickFormValues = {
  name: string;
  email: string;
};

type EngagementMode = 'existing' | 'quick-signup';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EngagementPayload = {
  mode: EngagementMode;
  user: { email?: string; name?: string };
  contactId: string;
  ownerId?: string;
  ownerName?: string;
};

export default function ShareLandingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<PageStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState('');
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [hasAccount, setHasAccount] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const { entitlements } = usePlan();
  const contactLimitMessage = useMemo(() => {
    if (isUnlimited(entitlements.contactLimit)) return '';
    const limit = entitlements.contactLimit ?? 0;
    if (limit <= 0) {
      return 'Лимит контактов для текущего тарифа исчерпан.';
    }
    return `В вашем тарифе доступно до ${limit} контактов первого круга. Удалите контакт или подключите InNet Pro для безлимита.`;
  }, [entitlements.contactLimit]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkAuth = () => {
      const loggedIn = localStorage.getItem('innet_logged_in') === 'true';
      setHasAccount(loggedIn);
    };
    checkAuth();
    window.addEventListener('storage', checkAuth);
    window.addEventListener('innet-auth-refresh', checkAuth);
    return () => {
      window.removeEventListener('storage', checkAuth);
      window.removeEventListener('innet-auth-refresh', checkAuth);
    };
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    setError(null);
    setSharePayload(null);

    const extractFromRouter = (): string | null => {
      const queryValue = router.query.token;
      if (typeof queryValue === 'string' && queryValue.trim()) {
        const normalized = extractShareToken(queryValue);
        if (normalized) return normalized;
      } else if (Array.isArray(queryValue) && queryValue.length > 0) {
        const normalized = extractShareToken(queryValue[0]);
        if (normalized) return normalized;
      }

      if (typeof window !== 'undefined') {
        const fromHref = extractShareToken(window.location.href);
        if (fromHref) return fromHref;
      }

      return null;
    };

    const normalizedToken = extractFromRouter();
    if (!normalizedToken) {
      setStatus('error');
      setError('Ссылка повреждена или больше не действует. Попросите отправить новый QR-код.');
      return;
    }

    try {
      const payload = parseShareToken(normalizedToken);
      setShareToken(normalizedToken);
      setSharePayload(payload);
      setProgressMessage(null);
      setStatus('ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось прочитать данные контакта.';
      setError(message);
      setStatus('error');
    }
  }, [router.isReady, router.query.token, router.asPath]);

  const handleRecordEngagement = useCallback(
    async (payload: EngagementPayload) => {
      if (!shareToken) return;
      try {
        const response = await fetch('/api/quick-engagement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: shareToken, ...payload }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { message?: string };
          const reason = typeof body?.message === 'string' ? body.message : `Status ${response.status}`;
          throw new Error(reason);
        }
      } catch (err) {
        console.warn('[share] Failed to record quick engagement', err);
      }
    },
    [shareToken]
  );

  const redirectToContact = useCallback(
    (contactId: string) => {
      setStatus('added');
      setProgressMessage('Перенаправляем в карточку контакта...');
      setTimeout(() => {
        router.push(`/app/contacts/${contactId}`);
      }, 450);
    },
    [router]
  );

  const mergeAndNavigate = useCallback(
    async (mode: EngagementMode, userHint?: { email?: string; name?: string }) => {
      if (!sharePayload) return;
      try {
        const existingContacts = loadContacts();
        const remoteId = sharePayload.owner?.id;
        if (
          !isUnlimited(entitlements.contactLimit) &&
          (entitlements.contactLimit ?? 0) > 0
        ) {
          const alreadyExists = remoteId
            ? existingContacts.some((contact) => contact.remoteId === remoteId)
            : false;
          if (!alreadyExists && existingContacts.length >= (entitlements.contactLimit ?? 0)) {
            setProgressMessage(null);
            setStatus('ready');
            setError(contactLimitMessage);
            return;
          }
        }
        const result = mergeContactFromShare(sharePayload);
        setProgressMessage(`Контакт «${result.contact.name}» добавлен в вашу сеть.`);
        const userInfo = userHint ?? getCurrentUserSignature();
        await handleRecordEngagement({
          mode,
          user: userInfo,
          contactId: result.contact.id,
          ownerId: sharePayload.owner?.id,
          ownerName: sharePayload.owner?.name,
        });
        redirectToContact(result.contact.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось добавить контакт.';
        setError(message);
        setStatus('error');
      }
    },
    [contactLimitMessage, entitlements.contactLimit, handleRecordEngagement, redirectToContact, sharePayload]
  );

  const handleAddForExisting = useCallback(async () => {
    if (!sharePayload) return;
    setError(null);
    setStatus('adding');
    setProgressMessage('Добавляем контакт в вашу сетку...');
    await mergeAndNavigate('existing');
  }, [mergeAndNavigate, sharePayload]);

  const handleQuickSignup = useCallback(
    async ({ name, email }: QuickFormValues) => {
      if (!sharePayload) return;
      setError(null);
      setStatus('adding');
      setProgressMessage('Создаём аккаунт и добавляем контакт...');

      try {
        const trimmedEmail = email.trim().toLowerCase();
        const trimmedName = name.trim();
        const users = loadUsers();
        const existing = users.find(
          (user) => user.email.trim().toLowerCase() === trimmedEmail
        );

        if (existing) {
          establishSession(existing);
          setHasAccount(true);
          setProgressMessage('Нашли ваш аккаунт. Добавляем новый контакт...');
          await mergeAndNavigate('existing', {
            email: existing.email,
            name: existing.name,
          });
          return;
        }

        const baseUser: UserAccount = {
          id: uuidv4(),
          email: trimmedEmail,
          password: uuidv4().replace(/-/g, '').slice(0, 12),
          name: trimmedName || 'Без имени',
          surname: undefined,
          avatar: undefined,
          avatarType: undefined,
          categories: [],
          factsByCategory: {},
          phone: undefined,
          telegram: undefined,
          instagram: undefined,
          createdAt: Date.now(),
          verified: true,
          quickSignup: true,
          plan: DEFAULT_PLAN,
          planActivatedAt: Date.now(),
          supabaseUid: null,
        };

        const remoteResult = await registerRemoteAccount(baseUser, baseUser.password);
        if (!remoteResult.ok) {
          throw new Error(remoteResult.message ?? 'Не удалось зарегистрировать аккаунт.');
        }

        const persistedUser: UserAccount = {
          ...remoteResult.user,
          password: baseUser.password,
          factsByCategory: remoteResult.user.factsByCategory ?? {},
          categories: remoteResult.user.categories ?? [],
          plan: remoteResult.user.plan ?? DEFAULT_PLAN,
          planActivatedAt: remoteResult.user.planActivatedAt ?? baseUser.planActivatedAt ?? Date.now(),
        };

        saveUsers([persistedUser, ...users]);
        establishSession(persistedUser);
        setHasAccount(true);

        await syncProfileToSupabase({
          email: persistedUser.email,
          name: persistedUser.name,
        });

        await mergeAndNavigate('quick-signup', {
          email: persistedUser.email,
          name: persistedUser.name,
        });
      } catch (err) {
        console.error('[share] Quick signup failed', err);
        const message = err instanceof Error ? err.message : 'Не удалось завершить быструю регистрацию.';
        setError(message);
        setStatus('error');
      }
    },
    [mergeAndNavigate, sharePayload]
  );

  const busy = status === 'adding' || status === 'added';

  const groups = useMemo<ShareGroup[]>(() => sharePayload?.groups ?? [], [sharePayload?.groups]);

  return (
    <Layout>
      <div className="mx-auto w-full max-w-3xl px-4 py-12">
        {status === 'loading' && (
          <StatusBlock
            title="Загружаем данные..."
            message="Секундочку. Распаковываем факты, которые вам хотят показать."
          />
        )}

        {status === 'error' && (
          <StatusBlock
            tone="error"
            title="Не удалось открыть ссылку"
            message={error ?? 'Свяжитесь с отправителем и попросите новый QR-код.'}
          />
        )}

        {sharePayload && status !== 'loading' && status !== 'error' && (
          <div className="space-y-8">
            <ShareSummary payload={sharePayload} groups={groups} />

            {progressMessage && (
              <StatusBlock
                tone={status === 'added' ? 'success' : 'info'}
                title={status === 'added' ? 'Готово!' : 'Обработка'}
                message={progressMessage}
              />
            )}

            {hasAccount ? (
              <ExistingAccountCTA disabled={busy} onAccept={handleAddForExisting} />
            ) : (
              <QuickSignupForm onSubmit={handleQuickSignup} disabled={busy} />
            )}

            <HintsFooter hasAccount={hasAccount} />
          </div>
        )}
      </div>
    </Layout>
  );
}

function QuickSignupForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (values: QuickFormValues) => void;
  disabled: boolean;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setLocalError(null);
  }, [disabled]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    setLocalError(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      setLocalError('Введите корректный email — мы сохраним его для профиля.');
      return;
    }
    onSubmit({ name: name.trim(), email: trimmedEmail });
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg">
      <h2 className="text-xl font-semibold text-slate-100">Быстрая регистрация</h2>
      <p className="mt-2 text-sm text-slate-400">
        Укажите имя и почту — мы создадим вам аккаунт, добавим контакт и отправим в ваш личный кабинет.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="quick-name" className="mb-1 block text-sm text-slate-300">
            Имя
          </label>
          <input
            id="quick-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Как к вам обращаться"
            disabled={disabled}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        <div>
          <label htmlFor="quick-email" className="mb-1 block text-sm text-slate-300">
            Email
          </label>
          <input
            id="quick-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="example@mail.com"
            disabled={disabled}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        {localError && <p className="text-sm text-red-400">{localError}</p>}
        <button
          type="submit"
          disabled={disabled}
          className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-background transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-70"
        >
          Создать аккаунт и добавить контакт
        </button>
      </form>
    </section>
  );
}

function ExistingAccountCTA({
  disabled,
  onAccept,
}: {
  disabled: boolean;
  onAccept: () => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 px-6 py-5 shadow-lg">
      <h2 className="text-xl font-semibold text-slate-100">Вы уже в InNet</h2>
      <p className="mt-2 text-sm text-slate-400">
        Мы заметили, что вы авторизованы. Нажмите кнопку ниже, и контакт моментально появится в вашей сети.
      </p>
      <button
        type="button"
        onClick={onAccept}
        disabled={disabled}
        className="mt-4 w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-background transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-70"
      >
        Добавить контакт в мою сеть
      </button>
    </section>
  );
}

function ShareSummary({ payload, groups }: { payload: SharePayload; groups: ShareGroup[] }) {
  const factsCount = useMemo(() => groups.reduce((acc, group) => acc + group.facts.length, 0), [groups]);
  const privacyNote = useMemo(() => {
    if (payload.privacy === 'direct-only') {
      return 'Контакт скрывает свои личные данные для всех, кто не знаком напрямую. После встречи вы сможете обменяться контактами вручную.';
    }
    if (payload.privacy === 'second-degree') {
      return 'Контакт показывает личные данные только друзьям и знакомым их знакомых. Возможно, часть информации скрыта.';
    }
    return null;
  }, [payload.privacy]);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
      <h1 className="text-2xl font-semibold text-slate-100">
        {payload.owner?.name || 'Новый контакт'} приглашает вас в сеть
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        Они готовы поделиться {factsCount} фактами в {groups.length} группах. После регистрации вы сможете сохранить их и добавить заметки.
      </p>
      {privacyNote && (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {privacyNote}
        </div>
      )}

      {groups.length > 0 && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {groups.map((group) => (
            <article key={group.id} className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
              <header className="mb-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Группа</p>
                <h3 className="text-lg font-semibold" style={{ color: group.color }}>
                  {group.name}
                </h3>
              </header>
              {group.facts.length === 0 ? (
                <p className="text-sm text-slate-500">Без фактов — возможно, собеседник скрыл их.</p>
              ) : (
                <ul className="space-y-2">
                  {group.facts.map((fact) => (
                    <li
                      key={fact.id}
                      className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-200"
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
  );
}

function StatusBlock({
  title,
  message,
  tone = 'info',
}: {
  title: string;
  message: string;
  tone?: 'info' | 'success' | 'error';
}) {
  const palette = {
    info: 'border-slate-700 bg-slate-900/70 text-slate-200',
    success: 'border-emerald-600/40 bg-emerald-900/20 text-emerald-200',
    error: 'border-red-600/40 bg-red-900/20 text-red-200',
  } as const;

  return (
    <div className={`mb-6 rounded-2xl border px-5 py-4 ${palette[tone]}`}>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm opacity-90">{message}</p>
    </div>
  );
}

function HintsFooter({ hasAccount }: { hasAccount: boolean }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 px-5 py-4 text-sm text-slate-400">
      {hasAccount ? (
        <p>
          Контакт сохранится в разделе «Контакты». Там же вы можете добавить заметки или поделиться фактами в ответ.
        </p>
      ) : (
        <p>
          После быстрой регистрации вы сможете заполнить профиль, добавить свои факты и сгенерировать собственный QR-код.
        </p>
      )}
    </section>
  );
}

function establishSession(user: UserAccount): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem('innet_logged_in', 'true');
    localStorage.setItem('innet_current_user_id', user.id);
    if (user.email) {
      localStorage.setItem('innet_current_user_email', user.email);
    } else {
      localStorage.removeItem('innet_current_user_email');
    }
    if (user.supabaseUid) {
      localStorage.setItem('innet_current_user_supabase_uid', user.supabaseUid);
    } else {
      localStorage.removeItem('innet_current_user_supabase_uid');
    }
    localStorage.setItem('innet_current_user_name', user.name);
    localStorage.setItem('innet_current_user_categories', JSON.stringify(user.categories ?? []));
    localStorage.setItem('innet_current_user_facts', JSON.stringify(user.factsByCategory ?? {}));
    localStorage.setItem('innet_current_user_verified', user.verified ? 'true' : 'false');
    localStorage.setItem('innet_qr_select_all_groups', 'true');

    syncOptionalField('innet_current_user_surname', user.surname);
    syncOptionalField('innet_current_user_phone', user.phone);
    syncOptionalField('innet_current_user_telegram', user.telegram);
    syncOptionalField('innet_current_user_instagram', user.instagram);
    syncOptionalField('innet_current_user_avatar', user.avatar);
    syncOptionalField('innet_current_user_avatar_type', user.avatarType);

    saveFactGroups(convertFactsToGroups(user.factsByCategory ?? {}));

    window.dispatchEvent(new Event('innet-auth-refresh'));
    window.dispatchEvent(new Event('innet-refresh-notifications'));
  } catch (err) {
    console.warn('[share] Failed to establish session', err);
  }
}

function syncOptionalField(key: string, value: string | undefined | null): void {
  if (typeof window === 'undefined') return;
  if (value == null || value === '') {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, value);
}

function getCurrentUserSignature(): { email?: string; name?: string } {
  if (typeof window === 'undefined') return {};
  const email = localStorage.getItem('innet_current_user_email') ?? undefined;
  const name = localStorage.getItem('innet_current_user_name') ?? undefined;
  return {
    email: email?.trim() ? email : undefined,
    name: name?.trim() ? name : undefined,
  };
}
