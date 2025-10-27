import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, RefObject } from 'react';
import Layout from '../../components/Layout';
import { loadUsers, saveUsers } from '../../lib/storage';
import { syncProfileToSupabase } from '../../lib/profileSync';

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

/* const sendVerificationEmail = async (recipient: string, personName: string) => {
  const response = await fetch('/api/send-confirmation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: recipient, name: personName }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message =
      typeof errorBody?.message === 'string'
        ? errorBody.message
        : 'Не удалось отправить письмо. Проверьте настройки почты.';
    throw new Error(message);
  }

  const data = (await response.json().catch(() => ({}))) as { previewUrl?: string; message?: string };
  return data;
}; */

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [isReady, setIsReady] = useState(false);
  /* const [codeInput, setCodeInput] = useState('');
  const [verificationFeedback, setVerificationFeedback] =
    useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false); */
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
  const [presetPickerOpen, setPresetPickerOpen] = useState(false);

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
      /* setCodeInput('');
      setVerificationFeedback(null); */
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

  const normalizeHandle = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
  };

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
  }, [stopAvatarStream]);

  const handleCaptureAvatar = useCallback(() => {
    const video = avatarVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
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
  }, [closeAvatarCamera, updateAvatar]);

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

  /* const handleVerifyCode = async () => {
    if (!profile) return;
    setVerificationFeedback(null);

    if (profile.verified) {
      setVerificationFeedback({ type: 'success', text: 'Почта уже подтверждена.' });
      return;
    }

    const trimmedCode = codeInput.trim();
    if (!trimmedCode) {
      setVerificationFeedback({ type: 'error', text: 'Введите код из письма.' });
      return;
    }

    setIsVerifying(true);
    try {
      const response = await fetch('/api/verify-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: profile.email, code: trimmedCode }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        setVerificationFeedback({
          type: 'error',
          text: body?.message ?? 'Не удалось подтвердить код. Попробуйте ещё раз.',
        });
        return;
      }

      const users = loadUsers();
      const updatedUsers = users.map((user) =>
        isSameUser(user) ? { ...user, verified: true, pendingVerificationCode: undefined } : user
      );
      saveUsers(updatedUsers);

      setProfile((prev) => (prev ? { ...prev, verified: true } : prev));
      setVerificationFeedback({ type: 'success', text: 'Почта успешно подтверждена.' });
      setCodeInput('');

      if (typeof window !== 'undefined') {
        localStorage.setItem('innet_current_user_verified', 'true');
        window.dispatchEvent(new Event('innet-refresh-notifications'));
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Не удалось подтвердить код. Попробуйте позже.';
      setVerificationFeedback({ type: 'error', text: message });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (!profile) return;
    setVerificationFeedback(null);
    setIsResending(true);
    try {
      const result = await sendVerificationEmail(
        profile.email,
        profile.name || 'InNet пользователь'
      );
      if (result?.previewUrl) {
        console.info('[send-confirmation] Preview URL:', result.previewUrl);
      }

      if (!profile.verified && typeof window !== 'undefined') {
        localStorage.setItem('innet_current_user_verified', 'false');
        window.dispatchEvent(new Event('innet-refresh-notifications'));
      }

      setVerificationFeedback({
        type: 'success',
        text: 'Новый код отправлен. Проверьте почту.',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Не удалось отправить код. Попробуйте позже.';
      setVerificationFeedback({ type: 'error', text: message });
    } finally {
      setIsResending(false);
    }
  }; */

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

            {/*
            <section className="rounded-xl bg-gray-800 p-6 shadow space-y-4">
              <h3 className="text-xl font-semibold">Подтверждение почты</h3>
              <p className="text-sm text-gray-400">
                На адрес <span className="text-gray-200">{profile.email}</span> отправлен код
                подтверждения. Введите его ниже, чтобы завершить активацию аккаунта.
              </p>
              {verificationFeedback && (
                <div
                  className={`rounded-md border px-4 py-3 text-sm ${
                    verificationFeedback.type === 'success'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                      : 'border-red-500/40 bg-red-500/10 text-red-200'
                  }`}
                >
                  {verificationFeedback.text}
                </div>
              )}
              {profile.verified ? (
                <p className="text-sm text-emerald-300">Почта подтверждена. Спасибо!</p>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={codeInput}
                      onChange={(event) => {
                        setCodeInput(event.target.value.replace(/\D/g, ''));
                        setVerificationFeedback(null);
                      }}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary tracking-[0.4em] text-center text-lg"
                      placeholder="Код"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyCode}
                      disabled={isVerifying}
                      className={`w-full sm:w-auto rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                        isVerifying
                          ? 'cursor-not-allowed bg-gray-600 text-gray-300'
                          : 'bg-primary text-background hover:bg-secondary'
                      }`}
                    >
                      {isVerifying ? 'Проверяем...' : 'Подтвердить'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResendCode()}
                      disabled={isResending}
                      className={`w-full sm:w-auto rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                        isResending
                          ? 'cursor-not-allowed border border-gray-700 текст-gray-400'
                          : 'border border-gray-600 text-gray-200 hover:border-primary'
                      }`}
                    >
                      {isResending ? 'Отправляем...' : 'Прислать код ещё раз'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Не видите письмо? Проверьте папку «Спам» или запросите новый код.
                  </p>
                </>
              )}
            </section>
            */}

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
          onClose={closeAvatarCamera}
          onCapture={handleCaptureAvatar}
          onRetry={() => void openAvatarCamera()}
        />
      )}
    </Layout>
  );
}

function AvatarCameraOverlay({
  videoRef,
  error,
  onClose,
  onCapture,
  onRetry,
}: {
  videoRef: RefObject<HTMLVideoElement>;
  error: string | null;
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
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-secondary"
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
