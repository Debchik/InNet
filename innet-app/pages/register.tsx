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
import { FACT_CATEGORY_CONFIG, FACT_CATEGORY_LABELS } from '../lib/categories';

type StepOneInputs = {
  email: string;
  password: string;
};

type Credentials = StepOneInputs & { confirmed: boolean };

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
  } = useForm<StepOneInputs>();

  const [credentials, setCredentials] = useState<Credentials | null>(null);
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

  const categoryLabelMap = FACT_CATEGORY_LABELS;

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

  const sendVerificationEmail = async (recipient: string, personName: string) => {
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
          : 'Не удалось отправить код подтверждения. Проверьте настройки почты.';
      throw new Error(message);
    }

    const data = (await response.json().catch(() => ({}))) as { previewUrl?: string; message?: string };
    return data;
  };


  const handleStepOne = (data: StepOneInputs) => {
    const trimmedEmail = data.email.trim().toLowerCase();
    const users = loadUsers();
    const alreadyExists = users.some(
      (user) => user.email.trim().toLowerCase() === trimmedEmail
    );
    if (alreadyExists) {
      setError('email', {
        type: 'manual',
        message: 'На эту почту уже зарегистрирован аккаунт',
      });
      return;
    }

    clearErrors();
    setCredentials({ ...data, email: trimmedEmail, confirmed: true });
    setStep(2);
  };

  const handleBackToStepOne = () => {
    setStep(1);
    setStepTwoErrors([]);
  };

  const toggleCategory = (categoryId: string) => {
    setStepTwoErrors([]);
    setFactLimitMessage(null);
    setSelectedCategories((prev) => {
      if (prev.includes(categoryId)) {
        setFactsByCategory((current) => {
          const { [categoryId]: _removed, ...rest } = current;
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
        const { [categoryId]: _removed, ...rest } = prev;
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

    const currentCredentials = credentials ?? { ...getValues(), confirmed: true };
    const email = currentCredentials.email.trim().toLowerCase();
    if (!email) {
      setStep(1);
      return;
    }

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

    const user: UserAccount = {
      id: uuidv4(),
      email,
      password: currentCredentials.password,
      name: trimmedName,
      surname: trimmedSurname || undefined,
      avatar: avatarValue,
      avatarType,
      categories: selectedCategories,
      factsByCategory: normalizedFacts,
      createdAt: Date.now(),
      verified: false,
    };

    const users = loadUsers();
    const withoutDuplicate = users.filter(
      (entry) => entry.email.trim().toLowerCase() !== email
    );
    saveUsers([...withoutDuplicate, user]);

    setIsCompleting(true);
    setStepTwoErrors([]);
    setFactLimitMessage(null);

    /* try {
      const result = await sendVerificationEmail(user.email, user.name || 'InNet пользователь');
      if (result?.previewUrl) {
        console.info('[send-confirmation] Preview URL:', result.previewUrl);
      }
    } catch (error) {
      console.error('Не удалось отправить код подтверждения', error);
    } */

    if (typeof window !== 'undefined') {
      localStorage.setItem('innet_logged_in', 'true');
      localStorage.setItem('innet_current_user_id', user.id);
      localStorage.setItem('innet_current_user_email', user.email);
      localStorage.setItem('innet_current_user_name', user.name);
      localStorage.setItem('innet_current_user_categories', JSON.stringify(user.categories));
      localStorage.setItem('innet_current_user_facts', JSON.stringify(user.factsByCategory));
      localStorage.setItem('innet_current_user_verified', 'false');
      localStorage.setItem('innet_qr_select_all_groups', 'true');
      window.dispatchEvent(new Event('innet-auth-refresh'));

      if (user.surname) {
        localStorage.setItem('innet_current_user_surname', user.surname);
      } else {
        localStorage.removeItem('innet_current_user_surname');
      }

      localStorage.removeItem('innet_current_user_phone');
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

    setIsCompleting(false);
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
                <label htmlFor="email" className="block text-sm mb-1">Email</label>
                <input
                  id="email"
                  type="email"
                  {...register('email', {
                    required: 'Введите email',
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: 'Некорректный формат email',
                    },
                  })}
                  className={`w-full px-3 py-2 bg-gray-700 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${errors.email ? 'border-red-500' : 'border-gray-600'}`}
                />
                {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
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
            </form>
          )}

          {step === 2 && (
            <div className="space-y-6">
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
