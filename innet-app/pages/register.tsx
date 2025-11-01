import { useRouter } from 'next/router';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, MouseEvent, RefObject } from 'react';
import { useForm } from 'react-hook-form';
import { v4 as uuidv4 } from 'uuid';
import Layout from '../components/Layout';
import {
  loadUsers,
  saveUsers,
  saveFactGroups,
  convertFactsToGroups,
  UserAccount,
} from '../lib/storage';
import { syncProfileToSupabase } from '../lib/profileSync';
import { getSupabaseClient } from '../lib/supabaseClient';
import { FACT_CATEGORY_CONFIG, FACT_CATEGORY_LABELS } from '../lib/categories';
import { DEFAULT_PLAN } from '../lib/plans';
import { setCurrentPlan } from '../lib/subscription';
import { isEmail, isPhone, normalizePhone } from '../utils/contact';
import type { SupabaseClient } from '@supabase/supabase-js';

type StepOneInputs = {
  contact: string;
  password: string;
};

type Credentials = {
  email: string;
  phone: string;
  password: string;
  confirmed: boolean;
};

type AvatarChoice =
  | { type: 'none'; value?: undefined }
  | { type: 'preset'; value: string }
  | { type: 'upload'; value: string };

type FactEntry = { id: string; text: string };

const PRESET_AVATARS: { id: string; label: string; gradient: string }[] = [
  { id: 'sunset', label: 'Sunset', gradient: 'bg-gradient-to-br from-amber-400 via-rose-500 to-pink-500' },
  { id: 'forest', label: 'Forest', gradient: 'bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500' },
  { id: 'midnight', label: 'Midnight', gradient: 'bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-500' },
];

export default function Register() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
    setError,
    clearErrors,
  } = useForm<StepOneInputs>({
    defaultValues: {
      contact: '',
      password: '',
    },
  });

  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [signupNotice, setSignupNotice] = useState<{ type: 'info' | 'error'; text: string } | null>(
    null
  );
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [factsByCategory, setFactsByCategory] = useState<Record<string, FactEntry[]>>({});
  const [avatar, setAvatar] = useState<AvatarChoice>({
    type: 'preset',
    value: PRESET_AVATARS[0]?.id,
  });
  const [stepTwoErrors, setStepTwoErrors] = useState<string[]>([]);
  const [categoryLimitMessage, setCategoryLimitMessage] = useState<string | null>(null);
  const [factLimitMessage, setFactLimitMessage] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ categoryId: string; factId: string } | null>(
    null
  );
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraSupported, setCameraSupported] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);

  const oauthPrefillAppliedRef = useRef(false);

  const categoryLabelMap = FACT_CATEGORY_LABELS;

  useEffect(() => {
    if (!router.isReady) return;
    const oauthProvider = typeof router.query.oauth === 'string' ? router.query.oauth : undefined;
    if (oauthProvider) {
      setStep(2);
    }
  }, [router.isReady, router.query.oauth]);

  useEffect(() => {
    try {
      const client = getSupabaseClient();
      setSupabase(client);
      setSupabaseError(null);
    } catch (error) {
      console.warn('[register] Supabase client unavailable', error);
      setSupabase(null);
      setSupabaseError(
        'Google-регистрация недоступна: проверьте переменные NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY.'
      );
    }
  }, []);

  const handleGoogleSignup = useCallback(() => {
    if (!supabase) {
      setSignupNotice({
        type: 'error',
        text:
          supabaseError ??
          'Регистрация через Google временно недоступна. Проверьте настройки Supabase.',
      });
      return;
    }

    const desiredPath = '/register?oauth=google';
    const next = encodeURIComponent(desiredPath);
    const redirectTo = `${window.location.origin}/auth/callback?type=signup&provider=google&next=${next}`;
    try {
      window.sessionStorage.setItem('innet_oauth_redirect', desiredPath);
    } catch {
      /* ignore storage restrictions */
    }
    void supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
  }, [supabase, supabaseError]);

  useEffect(() => {
    if (oauthPrefillAppliedRef.current) return;
    if (typeof window === 'undefined') return;
    let rawEmail: string | null = null;
    let rawFullName: string | null = null;
    try {
      rawEmail = window.sessionStorage.getItem('innet_oauth_email');
      rawFullName = window.sessionStorage.getItem('innet_oauth_full_name');
    } catch {
      return;
    }

    const normalizedEmail = rawEmail?.trim().toLowerCase();
    const trimmedFullName = rawFullName?.trim();
    if (!normalizedEmail && !trimmedFullName) {
      return;
    }

    oauthPrefillAppliedRef.current = true;

    if (normalizedEmail) {
      setCredentials((prev) => {
        const base: Credentials = prev
          ? { ...prev, email: normalizedEmail }
          : { email: normalizedEmail, password: '', phone: '', confirmed: true };
        return base;
      });
      if (step !== 2) {
        setStep(2);
      }
    }

    if (trimmedFullName) {
      const parts = trimmedFullName.split(/\s+/);
      if (parts.length > 0 && !name) {
        setName(parts[0]);
      }
      if (parts.length > 1 && !surname) {
        setSurname(parts.slice(1).join(' '));
      }
    }
  }, [name, step, surname]);

  useEffect(() => {
    // Clear temporary messages when selection count is valid again.
    if (selectedCategories.length <= 3) {
      setCategoryLimitMessage(null);
    }
  }, [selectedCategories.length]);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setCameraSupported(Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  // If user returns from Google OAuth or already has a Supabase session, skip to step 2
  useEffect(() => {
    if (!supabase) return;
    const primeFromSession = async () => {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email ?? '';
      const fullName = (data.user?.user_metadata?.full_name as string | undefined) || '';
      if (email) {
        setCredentials({ email, password: '', phone: '', confirmed: true });
        if (fullName && !name) setName(fullName);
        setStep(2);
      }
    };
    void primeFromSession();
    // also listen for changes
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void primeFromSession();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [name, supabase]);

  const stopCameraStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!isCameraOpen) {
      stopCameraStream();
      return;
    }

    let cancelled = false;
    setCameraError(null);

    const startCamera = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('Камера не поддерживается в этом браузере.');
        setCameraSupported(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
      } catch (error) {
        console.error('Camera access error:', error);
        setCameraError('Не удалось получить доступ к камере. Проверьте разрешения.');
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [isCameraOpen, stopCameraStream]);

  const handleStepOne = async (data: StepOneInputs) => {
    const rawContact = data.contact.trim();
    const contactIsEmail = isEmail(rawContact);
    const contactIsPhone = isPhone(rawContact);

    if (!contactIsEmail && !contactIsPhone) {
      setError('contact', {
        type: 'manual',
        message: 'Введите корректный email или номер телефона',
      });
      setSignupNotice(null);
      return;
    }

    const normalizedEmail = contactIsEmail ? rawContact.trim().toLowerCase() : '';
    const normalizedPhone = contactIsPhone ? normalizePhone(rawContact) : '';
    const users = loadUsers();
    const alreadyExists = users.some((user) => {
      if (contactIsEmail) {
        return user.email.trim().toLowerCase() === normalizedEmail;
      }
      if (contactIsPhone) {
        const existingPhone = user.phone ? normalizePhone(user.phone) : '';
        return existingPhone && existingPhone === normalizedPhone;
      }
      return false;
    });

    if (alreadyExists) {
      setError('contact', {
        type: 'manual',
        message: contactIsEmail
          ? 'На эту почту уже зарегистрирован аккаунт'
          : 'На этот номер уже зарегистрирован аккаунт',
      });
      setSignupNotice(null);
      return;
    }
    clearErrors();
    setSignupNotice(null);

    let requiresEmailConfirmation = false;

    // Try creating a Supabase auth user; if env missing, gracefully continue in local mode
    if (contactIsEmail) {
      try {
        if (supabase) {
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: normalizedEmail,
            password: data.password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/register')}`,
              data: normalizedPhone ? { phone: normalizedPhone } : undefined,
            },
          });

          if (signUpError) {
            const lower = signUpError.message ? signUpError.message.toLowerCase() : '';
            const humanMessage =
              lower.includes('already registered') || lower.includes('already exists')
                ? 'На эту почту уже зарегистрирован аккаунт. Попробуйте войти.'
                : `Supabase: ${signUpError.message || 'не удалось создать пользователя'}`;
            setError('contact', {
              type: 'manual',
              message: humanMessage,
            });
            setSignupNotice({ type: 'error', text: humanMessage });
            return;
          }

          requiresEmailConfirmation = !signUpData.user?.email_confirmed_at;

          if (requiresEmailConfirmation) {
            setSignupNotice({
              type: 'info',
              text: `Мы отправили письмо с подтверждением на ${normalizedEmail}. Перейдите по ссылке из письма, чтобы активировать аккаунт.`,
            });
          } else {
            setSignupNotice(null);
          }
        }
      } catch (err) {
        console.warn('[register] Supabase signUp failed, proceeding locally', err);
        setSignupNotice({
          type: 'error',
          text: 'Не удалось связаться с Supabase для отправки письма подтверждения. Регистрация продолжится, но проверьте настройки позже.',
        });
      }
    }

    setCredentials({
      email: normalizedEmail,
      phone: normalizedPhone,
      password: data.password,
      confirmed: !requiresEmailConfirmation,
    });
    setStep(2);
  };
  const handleBackToStepOne = () => {
    setStep(1);
    setStepTwoErrors([]);
    setSignupNotice(null);
  };

  const toggleCategory = (categoryId: string) => {
    setStepTwoErrors([]);
    setFactLimitMessage(null);
    setSelectedCategories((prev) => {
      if (prev.includes(categoryId)) {
        setFactsByCategory((current) => {
          const rest = { ...current };
          delete rest[categoryId];
          return rest;
        });
        if (focusRequest?.categoryId === categoryId) {
          setFocusRequest(null);
        }
        return prev.filter((id) => id !== categoryId);
      }

      if (prev.length >= 3) {
        setCategoryLimitMessage('Можно выбрать максимум 3 категории фактов.');
        return prev;
      }

      setCategoryLimitMessage(null);
      return [...prev, categoryId];
    });
  };

  const handleAddFact = (categoryId: string, text: string): string | null => {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }

    const existing = factsByCategory[categoryId] ?? [];
    if (existing.length >= 5) {
      setFactLimitMessage(
        `В категории «${categoryLabelMap[categoryId] ?? 'Категория'}» можно добавить максимум 5 фактов.`
      );
      return null;
    }

    const newFact: FactEntry = { id: uuidv4(), text: trimmed };
    setFactsByCategory((prev) => ({
      ...prev,
      [categoryId]: [newFact, ...(prev[categoryId] ?? [])],
    }));
    setStepTwoErrors([]);
    setFactLimitMessage(null);
    return newFact.id;
  };

  const handleUpdateFact = (categoryId: string, factId: string, value: string) => {
    setFactsByCategory((prev) => {
      const existing = prev[categoryId] ?? [];
      const nextFacts = existing.map((fact) =>
        fact.id === factId ? { ...fact, text: value } : fact
      );
      return { ...prev, [categoryId]: nextFacts };
    });
  };

  const removeFact = (categoryId: string, factId: string) => {
    setFactLimitMessage(null);
    setFactsByCategory((prev) => {
      const existing = prev[categoryId] ?? [];
      const updated = existing.filter((fact) => fact.id !== factId);
      if (updated.length === 0) {
        const rest = { ...prev };
        delete rest[categoryId];
        return rest;
      }
      return { ...prev, [categoryId]: updated };
    });
    if (focusRequest?.categoryId === categoryId && focusRequest.factId === factId) {
      setFocusRequest(null);
    }
  };

  const handleOpenCamera = () => {
    if (cameraSupported === false) {
      return;
    }
    setCameraError(null);
    setIsCameraOpen(true);
  };

  const handleCloseCamera = () => {
    setIsCameraOpen(false);
    setCameraError(null);
  };

  const handleRetryCamera = () => {
    stopCameraStream();
    setCameraError(null);
    setIsCameraOpen(false);
    setTimeout(() => setIsCameraOpen(true), 0);
  };

  const handleCapturePhoto = () => {
    if (cameraError) return;
    const video = videoRef.current;
    if (!video) {
      setCameraError('Видео поток не инициализирован.');
      return;
    }

    const canvas = canvasRef.current ?? (canvasRef.current = document.createElement('canvas'));
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('Не удалось сохранить снимок. Попробуйте ещё раз.');
      return;
    }

    context.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    if (!dataUrl) {
      setCameraError('Не удалось сохранить снимок. Попробуйте ещё раз.');
      return;
    }

    setAvatar({ type: 'upload', value: dataUrl });
    setIsCameraOpen(false);
  };

  const handleAvatarUpload = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = typeof reader.result === 'string' ? reader.result : '';
      if (base64) {
        setAvatar({ type: 'upload', value: base64 });
      }
    };
    reader.readAsDataURL(file);
  };

  const choosePresetAvatar = (presetId: string) => {
    setAvatar({ type: 'preset', value: presetId });
  };

  const validateStepTwo = () => {
    const validationErrors: string[] = [];
    if (!name.trim()) {
      validationErrors.push('Введите имя.');
    }

    if (selectedCategories.length < 1) {
      validationErrors.push('Выберите минимум 1 категорию фактов.');
    }

    if (selectedCategories.length > 3) {
      validationErrors.push('Можно выбрать максимум 3 категории.');
    }

    selectedCategories.forEach((categoryId) => {
      const facts = (factsByCategory[categoryId] ?? []).filter(
        (fact) => fact.text.trim().length > 0
      );
      if (facts.length === 0) {
        validationErrors.push(
          `Добавьте минимум один факт в категории "${categoryLabelMap[categoryId] ?? 'Категория'}".`
        );
      }
    });

    return validationErrors;
  };

  const completeRegistration = async () => {
    const validationErrors = validateStepTwo();
    if (validationErrors.length > 0) {
      setStepTwoErrors(validationErrors);
      return;
    }

    const formValues = getValues();
    const fallbackContact = formValues.contact?.trim() ?? '';
    const fallbackEmail = isEmail(fallbackContact) ? fallbackContact.trim().toLowerCase() : '';
    const fallbackPhone = isPhone(fallbackContact) ? normalizePhone(fallbackContact) : '';
    const fallbackPassword = formValues.password ?? '';

    const baseCredentials: Credentials =
      credentials ?? {
        email: fallbackEmail,
        phone: fallbackPhone,
        password: fallbackPassword,
        confirmed: true,
      };
    let effectiveEmail = baseCredentials.email.trim().toLowerCase();
    const effectivePhone = normalizePhone(baseCredentials.phone);

    const resolveEmail = async (): Promise<string | undefined> => {
      const fromCredentials = credentials?.email?.trim().toLowerCase();
      if (fromCredentials) return fromCredentials;

      if (supabase) {
        try {
          const { data } = await supabase.auth.getUser();
          const sessionEmail = data.user?.email?.trim().toLowerCase();
          if (sessionEmail) {
            setCredentials((prev) => {
              if (prev) {
                return { ...prev, email: sessionEmail };
              }
              return { email: sessionEmail, password: '', phone: '', confirmed: true };
            });
            return sessionEmail;
          }
        } catch (error) {
          console.warn('[register] Failed to recover email from Supabase session', error);
        }
      }

      if (typeof window !== 'undefined') {
        try {
          const storedEmail = window.sessionStorage.getItem('innet_oauth_email');
          if (storedEmail) {
            const normalized = storedEmail.trim().toLowerCase();
            setCredentials((prev) => {
              if (prev) {
                return { ...prev, email: normalized };
              }
              return { email: normalized, password: '', phone: '', confirmed: true };
            });
            return normalized;
          }
        } catch {
          /* ignore storage issues */
        }
      }

      return undefined;
    };

    if (!effectiveEmail && !effectivePhone) {
      const resolvedEmail = await resolveEmail();
      if (!resolvedEmail) {
        setStepTwoErrors([
          'Не удалось получить email аккаунта после входа через Google. Повторите попытку или зарегистрируйтесь вручную.',
        ]);
        return;
      }
      effectiveEmail = resolvedEmail;
    }

    const loginIdentifier = effectiveEmail || effectivePhone;
    if (!loginIdentifier) {
      setStepTwoErrors([
        'Укажите email или телефон, чтобы завершить регистрацию.',
      ]);
      return;
    }

    const effectiveCredentials: Credentials = {
      email: effectiveEmail,
      phone: effectivePhone,
      password: baseCredentials.password,
      confirmed: baseCredentials.confirmed,
    };
    setCredentials(effectiveCredentials);

    setIsCompleting(true);
    setStepTwoErrors([]);
    setFactLimitMessage(null);

    const trimmedName = name.trim();
    const trimmedSurname = surname.trim();

    const normalizedFacts = selectedCategories.reduce<Record<string, string[]>>(
      (acc, categoryId) => {
        const facts = (factsByCategory[categoryId] ?? [])
          .map((fact) => fact.text.trim())
          .filter((fact) => fact.length > 0)
          .slice(0, 5);
        if (facts.length > 0) {
          acc[categoryId] = facts;
        }
        return acc;
      },
      {}
    );

    const initialGroups = convertFactsToGroups(normalizedFacts);
    saveFactGroups(initialGroups);

    const avatarType =
      avatar.type === 'preset' || avatar.type === 'upload' ? avatar.type : undefined;
    const avatarValue =
      avatar.type === 'preset' || avatar.type === 'upload' ? avatar.value : undefined;

    const emailVerified = effectiveCredentials.confirmed || !effectiveEmail;

    const user: UserAccount = {
      id: uuidv4(),
      email: loginIdentifier,
      password: effectiveCredentials.password,
      name: trimmedName,
      surname: trimmedSurname || undefined,
      phone: effectivePhone || undefined,
      avatar: avatarValue,
      avatarType,
      categories: selectedCategories,
      factsByCategory: normalizedFacts,
      createdAt: Date.now(),
      verified: emailVerified,
      plan: DEFAULT_PLAN,
      planActivatedAt: Date.now(),
    };

    const users = loadUsers();
    const normalizedLogin = loginIdentifier.trim().toLowerCase();
    const withoutDuplicate = users.filter((entry) => {
      const entryLogin = entry.email.trim().toLowerCase();
      if (entryLogin === normalizedLogin) {
        return false;
      }
      if (effectivePhone) {
        const entryPhone = entry.phone ? normalizePhone(entry.phone) : '';
        if (entryPhone === effectivePhone) {
          return false;
        }
      }
      return true;
    });
    saveUsers([...withoutDuplicate, user]);

    if (typeof window !== 'undefined') {
      localStorage.setItem('innet_logged_in', 'true');
      localStorage.setItem('innet_current_user_id', user.id);
      localStorage.setItem('innet_current_user_email', user.email);
      localStorage.setItem('innet_current_user_name', user.name);
      localStorage.setItem('innet_current_user_categories', JSON.stringify(user.categories));
      localStorage.setItem('innet_current_user_facts', JSON.stringify(user.factsByCategory));
      localStorage.setItem('innet_current_user_verified', emailVerified ? 'true' : 'false');
      localStorage.setItem('innet_qr_select_all_groups', 'true');
      window.dispatchEvent(new Event('innet-auth-refresh'));

      setCurrentPlan(DEFAULT_PLAN);

      if (user.surname) {
        localStorage.setItem('innet_current_user_surname', user.surname);
      } else {
        localStorage.removeItem('innet_current_user_surname');
      }

      if (user.phone) {
        localStorage.setItem('innet_current_user_phone', user.phone);
      } else {
        localStorage.removeItem('innet_current_user_phone');
      }
      localStorage.removeItem('innet_current_user_telegram');
      localStorage.removeItem('innet_current_user_instagram');

      if (user.avatar) {
        localStorage.setItem('innet_current_user_avatar', user.avatar);
      } else {
        localStorage.removeItem('innet_current_user_avatar');
      }

      if (user.avatarType) {
        localStorage.setItem('innet_current_user_avatar_type', user.avatarType);
      } else {
        localStorage.removeItem('innet_current_user_avatar_type');
      }

      localStorage.removeItem('innet_dismiss_email_notification');
      localStorage.removeItem('innet_dismiss_contacts_notification');
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('innet-refresh-notifications'));
    }

    if (effectiveEmail) {
      void syncProfileToSupabase({
        email: effectiveEmail,
        name: user.name,
        surname: user.surname,
        phone: user.phone,
      });
    }

    setIsCompleting(false);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem('innet_oauth_email');
        window.sessionStorage.removeItem('innet_oauth_full_name');
      } catch {/* ignore storage cleanup errors */}
    }
    router.push('/app/qr');
  };

  return (
    <Layout>
      <div className="flex items-center justify-center py-20 px-4">
        <div className="w-full max-w-2xl bg-gray-800 p-8 rounded-xl shadow space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">
              {step === 1 ? 'Шаг 1 из 2: Данные для входа' : 'Шаг 2 из 2: Профиль и факты'}
            </h2>
            <p className="text-sm text-gray-400">Уже есть аккаунт?{' '}
              <Link href="/login" className="text-primary hover:underline">Войти</Link>
            </p>
          </div>

          {step === 1 && (
            <form onSubmit={handleSubmit(handleStepOne)} className="space-y-4">
              <div>
                <label htmlFor="contact" className="block text-sm mb-1">
                  Email или телефон <span className="text-primary font-medium">— на ваш выбор</span>
                </label>
                <input
                  id="contact"
                  type="text"
                  autoComplete="email"
                  {...register('contact', {
                    required: 'Введите email или номер телефона',
                    validate: (value) => {
                      if (isEmail(value) || isPhone(value)) {
                        return true;
                      }
                      return 'Введите корректный email или номер телефона';
                    },
                  })}
                  placeholder="например, name@example.com или +7 999 000-00-00"
                  className={`w-full px-3 py-2 bg-gray-700 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${
                    errors.contact ? 'border-red-500' : 'border-gray-600'
                  }`}
                />
                <p className="text-xs text-primary mt-1">
                  Используйте тот способ связи, которым удобно делиться. Его увидят ваши контакты.
                </p>
                {errors.contact && (
                  <p className="text-red-500 text-sm mt-1">{errors.contact.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm mb-1">Пароль</label>
                <input
                  id="password"
                  type="password"
                  {...register('password', {
                    required: 'Введите пароль',
                    minLength: { value: 6, message: 'Минимум 6 символов' },
                  })}
                  className={`w-full px-3 py-2 bg-gray-700 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${errors.password ? 'border-red-500' : 'border-gray-600'}`}
                />
                {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>}
              </div>

              <button
                type="submit"
                className="w-full bg-primary text-background py-2 rounded-md hover:bg-secondary transition-colors"
              >
                Продолжить
              </button>
              <button
                type="button"
                onClick={handleGoogleSignup}
                disabled={!supabase}
                className={`w-full mt-2 border border-gray-600 text-gray-100 py-2 rounded-md transition-colors ${
                  supabase ? 'hover:border-primary' : 'opacity-60 cursor-not-allowed'
                }`}
              >
                Зарегистрироваться через Google
              </button>
              {supabaseError && (
                <p className="text-xs text-yellow-400 mt-1">
                  {supabaseError}
                </p>
              )}
            </form>
          )}

          {step === 2 && (
            <div className="space-y-6">
              {signupNotice && (
                <div
                  className={`rounded-md border px-4 py-3 text-sm ${
                    signupNotice.type === 'info'
                      ? 'border-amber-400/40 bg-amber-500/10 text-amber-100'
                      : 'border-red-500/40 bg-red-500/10 text-red-200'
                  }`}
                >
                  {signupNotice.text}
                </div>
              )}
              <div className="space-y-6">
                <div className="space-y-3">
                  <p className="text-sm">Аватар (опционально)</p>
                  <div className="flex flex-wrap gap-3">
                    {PRESET_AVATARS.map((preset) => {
                      const isSelected = avatar.type === 'preset' && avatar.value === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => choosePresetAvatar(preset.id)}
                          className={`w-20 h-20 rounded-full border-2 transition-shadow flex items-center justify-center ${
                            isSelected ? 'border-primary shadow-lg shadow-primary/40' : 'border-transparent'
                          }`}
                        >
                          <span className={`w-full h-full rounded-full ${preset.gradient}`} />
                        </button>
                      );
                    })}
                    <label className="flex flex-col items-center justify-center w-32 h-20 border-2 border-dashed border-gray-600 rounded-lg text-xs text-gray-300 cursor-pointer hover:border-primary transition-colors">
                      <span>Загрузить фото</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          handleAvatarUpload(event.target.files);
                          event.target.value = '';
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleOpenCamera}
                      disabled={cameraSupported === false}
                      className={`flex flex-col items-center justify-center w-32 h-20 border-2 border-dashed rounded-lg text-xs transition-colors ${
                        cameraSupported === false
                          ? 'cursor-not-allowed border-gray-700 text-gray-500'
                          : 'border-gray-600 text-gray-300 hover:border-primary'
                      }`}
                    >
                      <span>Сделать фото</span>
                    </button>
                  </div>
                  {cameraSupported === false && (
                    <p className="text-xs text-yellow-400">
                      Камера не поддерживается в этом браузере или устройстве. Используйте загрузку файла.
                    </p>
                  )}
                  {avatar.type === 'upload' && avatar.value && (
                    <div className="flex items-center gap-3 mt-2">
                      <div className="w-16 h-16 rounded-full overflow-hidden border border-gray-600">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={avatar.value} alt="Загруженный аватар" className="w-full h-full object-cover" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setAvatar({ type: 'none' })}
                        className="text-sm text-gray-300 hover:underline"
                      >
                        Удалить загруженный аватар
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="name" className="block text-sm mb-1">Имя *</label>
                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="surname" className="block text-sm mb-1">Фамилия (опционально)</label>
                    <input
                      id="surname"
                      type="text"
                      value={surname}
                      onChange={(event) => setSurname(event.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <p className="text-sm mb-2">Выберите 1–3 категории фактов *</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {FACT_CATEGORY_CONFIG.map((option) => {
                      const isSelected = selectedCategories.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleCategory(option.id)}
                          className={`flex items-center justify-between px-3 py-2 rounded-md border transition-colors ${
                            isSelected
                              ? 'border-primary bg-primary/20 text-primary'
                              : 'border-gray-600 bg-gray-700 text-gray-200 hover:border-primary'
                          }`}
                        >
                          <span>{option.label}</span>
                          <span className="text-xs text-gray-300">
                            {isSelected ? 'Выбрано' : 'Выбрать'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {categoryLimitMessage && (
                    <p className="text-yellow-400 text-sm mt-2">{categoryLimitMessage}</p>
                  )}
                  {factLimitMessage && (
                    <p className="text-yellow-400 text-sm mt-2">{factLimitMessage}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    Начните печатать — факт сразу появится в списке, а поле снова станет пустым.
                  </p>
                </div>

                {selectedCategories.length > 0 && (
                  <div className="space-y-4">
                    {selectedCategories.map((categoryId) => {
                      const facts = factsByCategory[categoryId] ?? [];
                      const limitReached = facts.length >= 5;
                      const requestFocus =
                        focusRequest?.categoryId === categoryId ? focusRequest.factId : null;
                      return (
                        <div key={categoryId} className="bg-gray-900/40 p-4 rounded-lg border border-gray-700 space-y-3">
                          <h3 className="font-medium text-sm uppercase tracking-wide text-gray-300">
                            {categoryLabelMap[categoryId] ?? 'Категория'}
                          </h3>
                          <FactQuickAdd
                            disabled={isCompleting}
                            limitReached={limitReached}
                            onCommit={(value) => handleAddFact(categoryId, value)}
                            onFocusRequest={(factId) => setFocusRequest({ categoryId, factId })}
                            onLimitNotice={() =>
                              setFactLimitMessage(
                                `В категории «${categoryLabelMap[categoryId] ?? 'Категория'}» можно добавить максимум 5 фактов.`
                              )
                            }
                          />
                          {facts.length > 0 ? (
                            <ul className="space-y-2">
                              {facts.map((fact) => (
                                <li key={fact.id}>
                                  <EditableFactRow
                                    value={fact.text}
                                    autoFocus={requestFocus === fact.id}
                                    onFocusComplete={() => setFocusRequest(null)}
                                    onChange={(value) => handleUpdateFact(categoryId, fact.id, value)}
                                    onRemove={() => removeFact(categoryId, fact.id)}
                                    disabled={isCompleting}
                                  />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-gray-400">Добавьте минимум один факт в эту категорию.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {stepTwoErrors.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/60 rounded-md p-4 space-y-2 text-sm text-red-200">
                  {stepTwoErrors.map((error) => (
                    <p key={error}>{error}</p>
                  ))}
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleBackToStepOne}
                  className="w-full sm:w-auto border border-gray-600 text-gray-200 px-6 py-2 rounded-md hover:border-primary transition-colors"
                >
                  Назад
                </button>
                <button
                  type="button"
                  onClick={() => void completeRegistration()}
                  disabled={isCompleting}
                  className={`w-full sm:w-auto px-6 py-2 rounded-md transition-colors ${
                    isCompleting
                      ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                      : 'bg-primary text-background hover:bg-secondary'
                  }`}
                >
                  {isCompleting ? 'Создаём аккаунт...' : 'Создать аккаунт'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {isCameraOpen && (
        <CameraCaptureModal
          videoRef={videoRef}
          error={cameraError}
          onClose={handleCloseCamera}
          onCapture={handleCapturePhoto}
          onRetry={handleRetryCamera}
        />
      )}
    </Layout>
  );
}

function FactQuickAdd({
  onCommit,
  onFocusRequest,
  onLimitNotice,
  disabled,
  limitReached,
}: {
  onCommit: (text: string) => string | null;
  onFocusRequest: (factId: string) => void;
  onLimitNotice: () => void;
  disabled: boolean;
  limitReached: boolean;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!limitReached) return;
    if (value) {
      setValue('');
    }
    inputRef.current?.blur();
  }, [limitReached, value]);

  const handleAttemptLimitNotice = useCallback(() => {
    if (!limitReached) return;
    onLimitNotice();
  }, [limitReached, onLimitNotice]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (disabled || limitReached) {
      if (limitReached) {
        handleAttemptLimitNotice();
      }
      return;
    }

    const nextValue = event.target.value;
    setValue(nextValue);

    if (!nextValue.trim()) {
      return;
    }

    const newId = onCommit(nextValue);
    if (!newId) {
      return;
    }

    setValue('');
    requestAnimationFrame(() => inputRef.current?.blur());
    onFocusRequest(newId);
  };

  const handleFocus = () => {
    if (!limitReached) return;
    handleAttemptLimitNotice();
    requestAnimationFrame(() => inputRef.current?.blur());
  };

  const handleMouseDown = (event: MouseEvent<HTMLInputElement>) => {
    if (!limitReached) return;
    event.preventDefault();
    handleAttemptLimitNotice();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!limitReached) return;
    if (event.key === 'Tab') {
      return;
    }
    event.preventDefault();
    handleAttemptLimitNotice();
  };

  const isDisabled = disabled || limitReached;

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={handleChange}
      onFocus={handleFocus}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      autoComplete="off"
      placeholder="Добавьте факт..."
      readOnly={isDisabled}
      disabled={disabled}
      className={`w-full rounded-md border border-dashed px-3 py-2 text-sm transition-colors ${
        isDisabled
          ? 'cursor-not-allowed border-gray-700 bg-gray-800/70 text-gray-500 placeholder:text-gray-600'
          : 'border-gray-600 bg-gray-700 text-gray-100 focus:border-primary focus:ring-2 focus:ring-primary/60'
      }`}
    />
  );
}

function EditableFactRow({
  value,
  onChange,
  onRemove,
  autoFocus,
  onFocusComplete,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onRemove: () => void;
  autoFocus: boolean;
  onFocusComplete: () => void;
  disabled: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    adjustTextareaHeight(textareaRef.current);
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  useEffect(() => {
    if (!autoFocus) return;
    const node = textareaRef.current;
    if (!node) return;
    node.focus();
    const length = node.value.length;
    node.setSelectionRange(length, length);
    onFocusComplete();
  }, [autoFocus, onFocusComplete]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className="flex items-start gap-3 rounded-md border border-gray-700 bg-gray-800/80 px-3 py-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        rows={1}
        readOnly={disabled}
        className={`flex-1 resize-none bg-transparent text-sm text-gray-100 outline-none transition-colors ${
          disabled ? 'cursor-not-allowed text-gray-400' : 'focus:text-gray-100'
        }`}
      />
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="text-xs text-red-400 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Удалить
      </button>
    </div>
  );
}

function CameraCaptureModal({
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
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 text-gray-100 shadow-lg">
        <h3 className="text-lg font-semibold">Сделать фото</h3>
        <div className="relative mt-4 overflow-hidden rounded-lg border border-gray-700 bg-black">
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
                className="rounded-md border border-gray-600 px-4 py-2 text-sm text-gray-200 transition-colors hover:border-primary hover:text-primary"
              >
                Закрыть
              </button>
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-secondary"
              >
                Попробовать снова
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-600 px-4 py-2 text-sm text-gray-200 transition-colors hover:border-primary hover:text-primary"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={onCapture}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-secondary"
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

function adjustTextareaHeight(node: HTMLTextAreaElement | null) {
  if (!node) return;
  node.style.height = 'auto';
  node.style.height = `${node.scrollHeight}px`;
}
