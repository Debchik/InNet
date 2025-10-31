import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, RefObject } from 'react';
import Layout from '../../components/Layout';
import OnboardingHint from '../../components/onboarding/OnboardingHint';
import { loadUsers, saveUsers } from '../../lib/storage';
import { syncProfileToSupabase } from '../../lib/profileSync';
import { usePlan } from '../../hooks/usePlan';
import { usePrivacy, PrivacyLevel } from '../../hooks/usePrivacy';
import { useReminders } from '../../hooks/useReminders';
import { formatRelative } from '../../utils/time';

type ProfileInfo = {
  id: string;
  name: string;
  surname?: string;
  email: string;
  phone?: string;
  telegram?: string;
  instagram?: string;
  avatar?: string;
  avatarType?: 'preset' | 'upload';
  verified: boolean;
  pendingVerificationCode?: string;
};

const PRESET_AVATAR_STYLES: Record<string, string> = {
  sunset: 'bg-gradient-to-br from-amber-400 via-rose-500 to-pink-500',
  forest: 'bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500',
  midnight: 'bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-500',
};

const PRESET_AVATAR_LABELS: Record<string, string> = {
  sunset: 'Sunset',
  forest: 'Forest',
  midnight: 'Midnight',
};

const PRIVACY_COPY: Record<PrivacyLevel, { title: string; description: string }> = {
  public: {
    title: 'Показывать всем',
    description: 'Телефон и соцсети видят все, кто сканирует ваш QR-код.',
  },
  'second-degree': {
    title: 'Скрывать от третьего круга',
    description: 'Личные данные доступны друзьям и друзьям ваших друзей, но скрыты глубже.',
  },
  'direct-only': {
    title: 'Только прямые контакты',
    description: 'Телефон и соцсети открываются только людям, с которыми вы напрямую обменялись контактами.',
  },
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [telegramInput, setTelegramInput] = useState('');
  const [instagramInput, setInstagramInput] = useState('');
  const [contactsFeedback, setContactsFeedback] =
    useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSavingContacts, setIsSavingContacts] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarVideoRef = useRef<HTMLVideoElement>(null);
  const avatarStreamRef = useRef<MediaStream | null>(null);
  const [avatarCameraOpen, setAvatarCameraOpen] = useState(false);
  const [avatarCameraError, setAvatarCameraError] = useState<string | null>(null);
  const [avatarCameraReady, setAvatarCameraReady] = useState(false);
  const [presetPickerOpen, setPresetPickerOpen] = useState(false);
  const { entitlements } = usePlan();
  const { level: privacyLevel, setLevel: setPrivacyLevel, options: privacyOptions } = usePrivacy(entitlements);
  const displayPrivacyOptions = useMemo<PrivacyLevel[]>(() => {
    if (entitlements.allowFullPrivacy) {
      return privacyOptions;
    }
    const extended = new Set<PrivacyLevel>(privacyOptions);
    extended.add('direct-only');
    return Array.from(extended);
  }, [entitlements.allowFullPrivacy, privacyOptions]);
  const {
    settings: reminderSettings,
    updateSettings: updateReminderSettings,
    permission: reminderPermission,
    requestPermission: ensureReminderPermission,
    triggerTestReminder,
    nextReminderPreview,
    lastReminderMeta,
    activeSchedulesCount,
    dailyLimit: reminderDailyLimit,
  } = useReminders();
  const [reminderEnabled, setReminderEnabled] = useState(reminderSettings.enabled);
  const [reminderValue, setReminderValue] = useState(reminderSettings.cadence.value);
  const [reminderUnit, setReminderUnit] = useState(reminderSettings.cadence.unit);
  const [reminderFeedback, setReminderFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [isSavingReminders, setIsSavingReminders] = useState(false);
  const [isTestingReminder, setIsTestingReminder] = useState(false);

  useEffect(() => {
    setReminderEnabled(reminderSettings.enabled);
    setReminderValue(reminderSettings.cadence.value);
    setReminderUnit(reminderSettings.cadence.unit);
  }, [reminderSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const email = localStorage.getItem('innet_current_user_email') ?? '';
    const storedUsers = loadUsers();
    const user = storedUsers.find(
      (entry) => entry.email.trim().toLowerCase() === email.trim().toLowerCase()
    );

    if (user) {
      setProfile({
        id: user.id,
        name: user.name,
        surname: user.surname,
        email: user.email,
        phone: user.phone,
        telegram: user.telegram,
        instagram: user.instagram,
        avatar: user.avatar,
        avatarType: user.avatarType,
        verified: user.verified,
        pendingVerificationCode: user.pendingVerificationCode,
      });
      setPhoneInput(user.phone ?? '');
      setTelegramInput(user.telegram ?? '');
      setInstagramInput(user.instagram ?? '');
    } else {
      const fallbackName = localStorage.getItem('innet_current_user_name') ?? '';
      const fallbackSurname = localStorage.getItem('innet_current_user_surname') ?? undefined;
      const fallbackPhone = localStorage.getItem('innet_current_user_phone') ?? undefined;
      const fallbackTelegram = localStorage.getItem('innet_current_user_telegram') ?? undefined;
      const fallbackInstagram = localStorage.getItem('innet_current_user_instagram') ?? undefined;
      const fallbackAvatar = localStorage.getItem('innet_current_user_avatar') ?? undefined;
      const fallbackAvatarType =
        (localStorage.getItem('innet_current_user_avatar_type') as 'preset' | 'upload' | null) ??
        undefined;
      const fallbackId = localStorage.getItem('innet_current_user_id') ?? '';
      const fallbackVerified = localStorage.getItem('innet_current_user_verified') === 'true';

      if (email || fallbackName) {
        setProfile({
          id: fallbackId,
          name: fallbackName,
          surname: fallbackSurname || undefined,
          email,
          phone: fallbackPhone || undefined,
          telegram: fallbackTelegram || undefined,
          instagram: fallbackInstagram || undefined,
          avatar: fallbackAvatar || undefined,
          avatarType: fallbackAvatarType,
          verified: fallbackVerified,
          pendingVerificationCode: undefined,
        });
        setPhoneInput(fallbackPhone ?? '');
        setTelegramInput(fallbackTelegram ?? '');
        setInstagramInput(fallbackInstagram ?? '');
      }
    }

    setIsReady(true);
  }, []);

  const stopAvatarStream = useCallback(() => {
    if (avatarStreamRef.current) {
      avatarStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      });
      avatarStreamRef.current = null;
    }
    if (avatarVideoRef.current) {
      avatarVideoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => () => {
    stopAvatarStream();
  }, [stopAvatarStream]);

  const fullName = useMemo(() => {
    if (!profile) return '';
    return [profile.name, profile.surname].filter(Boolean).join(' ').trim();
  }, [profile]);

  const reminderPermissionLabel = useMemo(() => {
    switch (reminderPermission) {
      case 'granted':
        return 'браузер разрешил уведомления';
      case 'denied':
        return 'браузер блокирует уведомления';
      case 'default':
        return 'разрешение ещё не запрошено';
      default:
        return 'уведомления не поддерживаются';
    }
  }, [reminderPermission]);

  const cadencePreview = useMemo(() => {
    const normalized = Math.max(1, Math.round(reminderValue || 1));
    return reminderUnit === 'week'
      ? formatPlural(normalized, 'неделю', 'недели', 'недель')
      : formatPlural(normalized, 'месяц', 'месяца', 'месяцев');
  }, [reminderUnit, reminderValue]);

  const nextReminderText = useMemo(() => {
    if (!reminderEnabled) {
      return 'Напоминания выключены.';
    }
    if (!nextReminderPreview) {
      return 'Запланируем, как только появятся актуальные контакты.';
    }
    try {
      return new Date(nextReminderPreview).toLocaleString();
    } catch {
      return String(nextReminderPreview);
    }
  }, [nextReminderPreview, reminderEnabled]);

  const lastReminderText = useMemo(() => {
    if (!lastReminderMeta) {
      return 'Ещё не было напоминаний.';
    }
    const relative = formatRelative(lastReminderMeta.at);
    const absolute = new Date(lastReminderMeta.at).toLocaleString();
    return `${lastReminderMeta.name} — ${relative} (${absolute})`;
  }, [lastReminderMeta]);

const normalizeHandle = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
};

const isSameUser = useCallback(
  (user: { id: string; email: string }, reference?: ProfileInfo | null) => {
    const base = reference ?? profile;
    if (!base) return false;
    if (base.id) {
      return user.id === base.id;
    }
    return user.email.trim().toLowerCase() === base.email.trim().toLowerCase();
  },
  [profile]
);

const persistAvatar = useCallback(
  (updatedProfile: ProfileInfo) => {
    try {
      const users = loadUsers();
      const updatedUsers = users.map((user) =>
          isSameUser(user, updatedProfile)
            ? { ...user, avatar: updatedProfile.avatar, avatarType: updatedProfile.avatarType }
            : user
        );
        saveUsers(updatedUsers);
      } catch (error) {
        console.warn('[profile] Failed to persist avatar', error);
      }

      if (typeof window !== 'undefined') {
        if (updatedProfile.avatar && updatedProfile.avatarType) {
          localStorage.setItem('innet_current_user_avatar', updatedProfile.avatar);
          localStorage.setItem('innet_current_user_avatar_type', updatedProfile.avatarType);
        } else {
          localStorage.removeItem('innet_current_user_avatar');
          localStorage.removeItem('innet_current_user_avatar_type');
        }
        window.dispatchEvent(new Event('innet-profile-updated'));
      }
    },
    [isSameUser]
  );

  const updateAvatar = useCallback(
    (type: 'preset' | 'upload' | null, value?: string) => {
      if (!profile) return;
      if (type && !value) {
        return;
      }

      const nextProfile: ProfileInfo = {
        ...profile,
        avatarType: type ?? undefined,
        avatar: type ? value : undefined,
      };

      setProfile(nextProfile);
      persistAvatar(nextProfile);
      setPresetPickerOpen(false);
    },
    [persistAvatar, profile]
  );

  const openAvatarCamera = useCallback(async () => {
    setPresetPickerOpen(false);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setAvatarCameraError('Камера не поддерживается в этом браузере.');
      setAvatarCameraOpen(true);
      return;
    }
    try {
      setAvatarCameraReady(false);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'user' } },
        audio: false,
      });
      stopAvatarStream();
      avatarStreamRef.current = stream;
      const video = avatarVideoRef.current;
      if (video) {
        video.srcObject = stream;
        video.playsInline = true;
        const handleReady = () => {
          setAvatarCameraReady(true);
          video.removeEventListener('loadedmetadata', handleReady);
          video.removeEventListener('canplay', handleReady);
        };
        video.addEventListener('loadedmetadata', handleReady);
        video.addEventListener('canplay', handleReady);
        const playVideo = () => {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => undefined);
          }
        };
        if (video.readyState >= 2 && video.videoWidth > 0) {
          playVideo();
          handleReady();
        } else {
          const handleLoaded = () => {
            playVideo();
            video.removeEventListener('loadedmetadata', handleLoaded);
          };
          video.addEventListener('loadedmetadata', handleLoaded);
        }
      }
      setAvatarCameraError(null);
      setAvatarCameraOpen(true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Не удалось получить доступ к камере. Проверьте разрешения.';
      setAvatarCameraError(message);
      setAvatarCameraOpen(true);
    }
  }, [stopAvatarStream]);

  const closeAvatarCamera = useCallback(() => {
    stopAvatarStream();
    setAvatarCameraOpen(false);
    setAvatarCameraError(null);
    setAvatarCameraReady(false);
  }, [stopAvatarStream]);

  const handleCaptureAvatar = useCallback(() => {
    const video = avatarVideoRef.current;
    if (!avatarCameraReady || !video || !video.videoWidth || !video.videoHeight) {
      setAvatarCameraError('Камера ещё не готова. Попробуйте снова.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setAvatarCameraError('Не удалось сделать снимок.');
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    updateAvatar('upload', dataUrl);
    closeAvatarCamera();
  }, [avatarCameraReady, closeAvatarCamera, updateAvatar]);

  const handleAvatarUpload = (event: ChangeEvent<HTMLInputElement>) => {
    setPresetPickerOpen(false);
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        updateAvatar('upload', result);
      }
    };
    reader.readAsDataURL(file);
    // Allow selecting the same file again later
    event.target.value = '';
  };

  const handlePresetSelect = (presetId: string) => {
    updateAvatar('preset', presetId);
  };

  const handleAvatarReset = () => {
    updateAvatar(null);
  };

  const handleSaveReminders = useCallback(async () => {
    setReminderFeedback(null);
    const maxValue = reminderUnit === 'week' ? 12 : 12;
    const normalizedValue = Math.min(
      maxValue,
      Math.max(1, Math.round(reminderValue))
    );
    setReminderValue(normalizedValue);
    setIsSavingReminders(true);
    try {
      updateReminderSettings((prev) => ({
        ...prev,
        enabled: reminderEnabled,
        cadence: {
          value: normalizedValue,
          unit: reminderUnit,
        },
      }));
      let permissionState = reminderPermission;
      if (reminderEnabled && permissionState === 'default') {
        permissionState = await ensureReminderPermission();
      }
      const unitWord =
        reminderUnit === 'week'
          ? pluralWord(normalizedValue, 'неделю', 'недели', 'недель')
          : pluralWord(normalizedValue, 'месяц', 'месяца', 'месяцев');
      setReminderFeedback({
        type: reminderEnabled ? (permissionState === 'granted' ? 'success' : 'info') : 'success',
        text: reminderEnabled
          ? permissionState === 'granted'
            ? `Будем напоминать примерно раз в ${normalizedValue} ${unitWord} с небольшим разбросом, чтобы уведомления не приходили одновременно.`
            : 'Напоминания включены. Разрешите уведомления браузера, чтобы получать пуши, либо держите вкладку открытой.'
          : 'Напоминания отключены.',
      });
    } catch (error) {
      console.error('[profile] Failed to save reminder settings', error);
      setReminderFeedback({
        type: 'error',
        text: 'Не удалось сохранить настройки напоминаний. Попробуйте ещё раз.',
      });
    } finally {
      setIsSavingReminders(false);
    }
  }, [
    ensureReminderPermission,
    reminderEnabled,
    reminderPermission,
    reminderUnit,
    reminderValue,
    updateReminderSettings,
  ]);

  const handleTestReminder = useCallback(async () => {
    setReminderFeedback(null);
    let permissionState = reminderPermission;
    if (permissionState === 'default') {
      permissionState = await ensureReminderPermission();
    }
    setIsTestingReminder(true);
    try {
      const contact = await triggerTestReminder();
      if (!contact) {
        setReminderFeedback({
          type: 'error',
          text: 'Добавьте хотя бы один контакт, чтобы протестировать напоминания.',
        });
        return;
      }
      setReminderFeedback({
        type: permissionState === 'granted' ? 'success' : 'info',
        text:
          permissionState === 'granted'
            ? `Тестовое напоминание отправлено: ${contact.name}.`
            : `Показали тестовое окно для ${contact.name}. Разрешите уведомления, чтобы пуши работали в фоне.`,
      });
    } catch (error) {
      console.error('[profile] Failed to trigger test reminder', error);
      setReminderFeedback({
        type: 'error',
        text: 'Не удалось запустить тест. Попробуйте позже.',
      });
    } finally {
      setIsTestingReminder(false);
    }
  }, [ensureReminderPermission, reminderPermission, triggerTestReminder]);

  const handleSaveContacts = () => {
    if (!profile) return;
    setContactsFeedback(null);
    setIsSavingContacts(true);

    const phoneValue = phoneInput.trim();
    const telegramValue = normalizeHandle(telegramInput);
    const instagramValue = normalizeHandle(instagramInput);

    // Проверка российского номера: +7 или 8, 10 цифр после
    if (phoneValue) {
      const cleaned = phoneValue.replace(/\D/g, '');
      const isValid =
        (phoneValue.startsWith('+7') && cleaned.length === 11) ||
        (phoneValue.startsWith('8') && cleaned.length === 11);
      if (!isValid) {
        setContactsFeedback({
          type: 'error',
          text: 'Введите корректный российский номер: +7XXXXXXXXXX или 8XXXXXXXXXX',
        });
        setIsSavingContacts(false);
        return;
      }
    }

    try {
      const users = loadUsers();
      const updatedUsers = users.map((user) =>
        isSameUser(user)
          ? {
              ...user,
              phone: phoneValue || undefined,
              telegram: telegramValue,
              instagram: instagramValue,
            }
          : user
      );
      saveUsers(updatedUsers);

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              phone: phoneValue || undefined,
              telegram: telegramValue,
              instagram: instagramValue,
            }
          : prev
      );
      setContactsFeedback({ type: 'success', text: 'Контакты сохранены.' });

      if (typeof window !== 'undefined') {
        if (phoneValue) {
          localStorage.setItem('innet_current_user_phone', phoneValue);
        } else {
          localStorage.removeItem('innet_current_user_phone');
        }
        if (telegramValue) {
          localStorage.setItem('innet_current_user_telegram', telegramValue);
        } else {
          localStorage.removeItem('innet_current_user_telegram');
        }
        if (instagramValue) {
          localStorage.setItem('innet_current_user_instagram', instagramValue);
        } else {
          localStorage.removeItem('innet_current_user_instagram');
        }
        window.dispatchEvent(new Event('innet-refresh-notifications'));
        window.dispatchEvent(new Event('innet-profile-updated'));
      }

      void syncProfileToSupabase({
        email: profile.email,
        name: profile.name,
        surname: profile.surname,
        phone: phoneValue || undefined,
        telegram: telegramValue,
        instagram: instagramValue,
      });
    } catch (error) {
      console.error('Не удалось сохранить контакты', error);
      setContactsFeedback({
        type: 'error',
        text: 'Не удалось сохранить контакты. Попробуйте позже.',
      });
    } finally {
      setIsSavingContacts(false);
    }
  };

  return (
    <Layout>
      <div className="px-4 py-8 max-w-3xl mx-auto w-full">
        <OnboardingHint
          id="profile"
          title="Настройте визитку и приватность"
          description="Добавьте имя, аватар, контакты и выберите уровень приватности — так собеседники будут понимать, как с вами связаться."
          bullets={[
            'Можно загрузить фото, выбрать пресет или сделать снимок в приложении.',
            'Контактные данные показываются только при выбранном уровне приватности.',
            'Подтверждение почты появится позже — сейчас аккаунт работает без этого шага.',
          ]}
          className="mb-6"
        />
        <h1 className="text-3xl font-bold mb-6">Мой профиль</h1>
        {!isReady && (
          <div className="rounded-xl bg-gray-800 p-6 animate-pulse text-gray-500">
            Загружаем профиль...
          </div>
        )}

        {isReady && !profile && (
          <div className="rounded-xl bg-gray-800 p-6 text-gray-300">
            Данные профиля не найдены. Попробуйте перезайти в аккаунт.
          </div>
        )}

        {isReady && profile && (
          <div className="space-y-6">
            <section className="rounded-xl bg-gray-800 p-6 flex flex-col sm:flex-row items-center sm:items-start gap-6 shadow">
              <div className="relative">
                <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-gray-700 flex items-center justify-center">
                  {profile.avatarType === 'upload' && profile.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar}
                      alt="Аватар"
                      className="w-full h-full object-cover"
                    />
                  ) : profile.avatarType === 'preset' && profile.avatar ? (
                    <span className={`w-full h-full ${PRESET_AVATAR_STYLES[profile.avatar] ?? 'bg-gray-600'}`} />
                  ) : (
                    <span className="w-full h-full bg-gray-700 flex items-center justify-center text-2xl text-gray-400">
                      {profile.name ? profile.name[0]?.toUpperCase() : '🧑'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-1 space-y-2 text-center sm:text-left">
                <p className="text-sm uppercase tracking-wide text-gray-400">ФИО</p>
                <h2 className="text-2xl font-semibold">
                  {fullName || 'Имя будет указано после заполнения профиля'}
                </h2>
                <p className="text-sm text-gray-400">
                  Почта: <span className="text-gray-200">{profile.email || '—'}</span>
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <button
                    type="button"
                    onClick={() => setPresetPickerOpen((prev) => !prev)}
                    className="rounded-full border border-gray-600 px-4 py-2 text-xs font-semibold text-gray-200 transition hover:border-primary hover:text-primary"
                  >
                    {presetPickerOpen ? 'Скрыть пресеты' : 'Выбрать пресет'}
                  </button>
                  <label className="cursor-pointer rounded-full border border-gray-600 px-4 py-2 text-xs font-semibold text-gray-200 transition hover:border-primary hover:text-primary">
                    Загрузить фото
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="sr-only"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void openAvatarCamera()}
                    className="rounded-full border border-gray-600 px-4 py-2 text-xs font-semibold text-gray-200 transition hover:border-primary hover:text-primary"
                  >
                    Сделать селфи
                  </button>
                  {(profile.avatar || profile.avatarType) && (
                    <button
                      type="button"
                      onClick={handleAvatarReset}
                      className="rounded-full border border-gray-600 px-4 py-2 text-xs font-semibold text-gray-200 transition hover:border-red-400 hover:text-red-300"
                    >
                      Сбросить фото
                    </button>
                  )}
                </div>
                {presetPickerOpen && (
                  <div className="mt-3 grid w-full grid-cols-3 gap-3 sm:grid-cols-4">
                    {Object.entries(PRESET_AVATAR_STYLES).map(([presetId, presetClass]) => {
                      const active = profile.avatarType === 'preset' && profile.avatar === presetId;
                      return (
                        <button
                          key={presetId}
                          type="button"
                          onClick={() => handlePresetSelect(presetId)}
                          className={`flex flex-col items-center rounded-lg border px-2 py-2 text-xs transition ${
                            active
                              ? 'border-primary text-primary'
                              : 'border-gray-700 text-gray-300 hover:border-primary/70 hover:text-primary'
                          }`}
                        >
                          <span className={`mb-2 block h-12 w-full rounded-md ${presetClass}`} />
                          <span>{PRESET_AVATAR_LABELS[presetId] ?? presetId}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {/*
                <div className="mt-2 flex items-center justify-center sm:justify-start">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                      profile.verified
                        ? 'bg-emerald-500/20 text-emerald-200'
                        : 'bg-amber-500/20 text-amber-200'
                    }`}
                  >
                    {profile.verified ? 'Почта подтверждена' : 'Почта не подтверждена'}
                  </span>
                </div>
                */}
              </div>
            </section>

            <section className="rounded-xl bg-gray-800 p-6 shadow space-y-3">
              <h3 className="text-xl font-semibold">Подтверждение почты</h3>
              <p className="text-sm text-gray-400">
                Функция подтверждения почты временно недоступна. Как только мы её включим, появится уведомление и отдельная кнопка.
              </p>
            </section>

            <section className="rounded-xl bg-gray-800 p-6 shadow space-y-4">
              <h3 className="text-xl font-semibold">Приватность контактов</h3>
              <p className="text-sm text-gray-400">
                Управляйте тем, кто видит ваши контактные данные при обмене QR-кодом.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {displayPrivacyOptions.map((level) => {
                  const meta = PRIVACY_COPY[level];
                  const allowed = privacyOptions.includes(level);
                  const selected = privacyLevel === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => allowed && setPrivacyLevel(level)}
                      disabled={!allowed}
                      className={`rounded-xl border px-4 py-3 text-left transition ${
                        selected
                          ? 'border-primary bg-primary/10 text-white'
                          : allowed
                            ? 'border-gray-700 bg-gray-900/70 text-gray-200 hover:border-primary/70'
                            : 'cursor-not-allowed border-gray-800 bg-gray-900/40 text-gray-500'
                      }`}
                    >
                      <p className="text-sm font-semibold">{meta.title}</p>
                      <p className="mt-1 text-xs text-gray-400">{meta.description}</p>
                      {!allowed && (
                        <span className="mt-3 inline-flex rounded-full bg-primary/20 px-3 py-1 text-xs font-semibold text-primary">
                          Доступно в InNet Pro
                        </span>
                      )}
                      {selected && (
                        <span className="mt-3 inline-flex rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-200">
                          Выбрано
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl bg-gray-800 p-6 shadow space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-xl font-semibold">Напоминания о людях</h3>
                  <p className="text-sm text-gray-400">
                    Попросим вас выйти на связь с кем-то из списка в случайный момент. Выберите базовый интервал
                    (в неделях или месяцах) — система сама добавит разброс и не покажет больше двух напоминаний в день.
                  </p>
                </div>
                <label className="flex items-center gap-2 rounded-md bg-gray-900/40 px-3 py-2 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={reminderEnabled}
                    onChange={(event) => {
                      setReminderEnabled(event.target.checked);
                      setReminderFeedback(null);
                    }}
                  />
                  <span>Включить</span>
                </label>
              </div>
              <p className="text-xs text-gray-500">
                Статус уведомлений браузера: {reminderPermissionLabel}.
              </p>
              {reminderFeedback && (
                <div
                  className={`rounded-md border px-4 py-3 text-sm ${
                    reminderFeedback.type === 'success'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                      : reminderFeedback.type === 'info'
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-red-500/40 bg-red-500/10 text-red-200'
                  }`}
                >
                  {reminderFeedback.text}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm text-gray-300">Интервал напоминаний</span>
                  <input
                    type="number"
                    min={1}
                    max={reminderUnit === 'week' ? 12 : 12}
                    step={1}
                    value={reminderValue}
                    onChange={(event) => {
                      const raw = Number(event.target.value);
                      const next = Number.isNaN(raw) ? 1 : Math.max(1, raw);
                      setReminderValue(next);
                      setReminderFeedback(null);
                    }}
                    className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-gray-300">Единица измерения</span>
                  <select
                    value={reminderUnit}
                    onChange={(event) => {
                      const nextUnit = event.target.value === 'month' ? 'month' : 'week';
                      setReminderUnit(nextUnit);
                      setReminderFeedback(null);
                    }}
                    className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="week">недели</option>
                    <option value="month">месяцы</option>
                  </select>
                </label>
              </div>
              <div className="rounded-md bg-gray-900/40 px-4 py-3 text-xs text-gray-400 space-y-1">
                <p>Базовый интервал: {cadencePreview} (добавляем случайный разброс).</p>
                <p>
                  Активных контактов: {activeSchedulesCount}. В день не больше{' '}
                  {formatPlural(reminderDailyLimit, 'напоминание', 'напоминания', 'напоминаний')}.
                </p>
                <p>Следующее напоминание: {nextReminderText}</p>
                <p>Последнее напоминание: {lastReminderText}</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => void handleSaveReminders()}
                  disabled={isSavingReminders}
                  className={`w-full sm:w-auto rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    isSavingReminders
                      ? 'cursor-not-allowed bg-gray-600 text-gray-300'
                      : 'bg-primary text-background hover:bg-secondary'
                  }`}
                >
                  {isSavingReminders ? 'Сохраняем...' : 'Сохранить напоминания'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleTestReminder()}
                  disabled={isTestingReminder}
                  className={`w-full sm:w-auto rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                    isTestingReminder
                      ? 'cursor-not-allowed border-gray-600 text-gray-300'
                      : 'border-primary/60 text-primary hover:bg-primary/10'
                  }`}
                >
                  {isTestingReminder ? 'Запускаем...' : 'Запустить тест'}
                </button>
              </div>
            </section>

            <section className="rounded-xl bg-gray-800 p-6 shadow space-y-4">
              <h3 className="text-xl font-semibold">Контакты</h3>
              <p className="text-sm text-gray-400">
                Эти данные видите только вы до тех пор, пока не поделитесь ими с другим пользователем.
              </p>
              {contactsFeedback && (
                <div
                  className={`rounded-md border px-4 py-3 text-sm ${
                    contactsFeedback.type === 'success'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                      : 'border-red-500/40 bg-red-500/10 text-red-200'
                  }`}
                >
                  {contactsFeedback.text}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm text-gray-300">Телефон</span>
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(event) => {
                      let val = event.target.value.replace(/^\s+/, '');
                      // Если не начинается с +7 или 8, подставить +7
                      if (!val.startsWith('+7') && !val.startsWith('8')) {
                        val = '+7' + val.replace(/^\+?\d*/, '');
                      }
                      setPhoneInput(val);
                      setContactsFeedback(null);
                    }}
                    placeholder="+7"
                    className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-gray-300">Telegram</span>
                  <input
                    type="text"
                    value={telegramInput}
                    onChange={(event) => {
                      setTelegramInput(event.target.value);
                      setContactsFeedback(null);
                    }}
                    placeholder="@username"
                    className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-gray-300">Instagram</span>
                  <input
                    type="text"
                    value={instagramInput}
                    onChange={(event) => {
                      setInstagramInput(event.target.value);
                      setContactsFeedback(null);
                    }}
                    placeholder="@nickname"
                    className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleSaveContacts}
                  disabled={isSavingContacts}
                  className={`w-full sm:w-auto rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    isSavingContacts
                      ? 'cursor-not-allowed bg-gray-600 text-gray-300'
                      : 'bg-primary text-background hover:bg-secondary'
                  }`}
                >
                  {isSavingContacts ? 'Сохраняем...' : 'Сохранить контакты'}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
      {avatarCameraOpen && (
        <AvatarCameraOverlay
          videoRef={avatarVideoRef}
          error={avatarCameraError}
          ready={avatarCameraReady}
          onClose={closeAvatarCamera}
          onCapture={handleCaptureAvatar}
          onRetry={() => void openAvatarCamera()}
        />
      )}
    </Layout>
  );
}

function pluralWord(value: number, one: string, two: string, many: string): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return two;
  return many;
}

function formatPlural(value: number, one: string, two: string, many: string): string {
  return `${value} ${pluralWord(value, one, two, many)}`;
}

function AvatarCameraOverlay({
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
