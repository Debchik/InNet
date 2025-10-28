import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Trash2 } from 'lucide-react';
import Layout from '../../components/Layout';
import {
  FactGroup,
  FACT_TEXT_LIMIT,
  loadFactGroups,
  saveFactGroups,
  createFactGroup,
  createFact,
} from '../../lib/storage';
import { FACT_CATEGORY_CONFIG } from '../../lib/categories';
import { fetchRemoteFacts, upsertRemoteFacts } from '../../lib/factsRemote';
import { getOrCreateProfileId } from '../../lib/share';

const FACT_SYNC_STORAGE_KEY = 'innet_fact_sync_enabled';
const COLOR_OPTIONS = [
  { value: '#14F4FF', label: 'Лазурный' },
  { value: '#FF6BCE', label: 'Фуксия' },
  { value: '#8B5CF6', label: 'Неоновый фиолетовый' },
  { value: '#22D3EE', label: 'Бирюзовый лед' },
  { value: '#FBBF24', label: 'Солнечный' },
] as const;

const MAX_GROUPS = 3;
const MAX_FACTS_PER_GROUP = 5;
const FACT_LIMIT_MESSAGE =
  'В этой группе достигнут лимит фактов. Удалите один, чтобы добавить новый.';
const GROUP_NAME_LIMIT = 30;

type FocusRequest = { groupId: string; factId: string } | null;
type HoldTarget =
  | { type: 'group'; groupId: string }
  | { type: 'fact'; groupId: string; factId: string };

/**
 * Facts management page. Users can create groups of facts and quickly
 * capture long-form facts straight from a phone without extra buttons.
 * The state persists in localStorage with optional Supabase synchronization.
 */
export default function FactsPage() {
  const [groups, setGroups] = useState<FactGroup[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [newGroupColor, setNewGroupColor] = useState<string>(COLOR_OPTIONS[0].value);
  const [errors, setErrors] = useState('');
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const [holdTarget, setHoldTarget] = useState<HoldTarget | null>(null);
  const [profileId, setProfileId] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setGroups(loadFactGroups());
    if (typeof window !== 'undefined') {
      const storedSync = localStorage.getItem(FACT_SYNC_STORAGE_KEY);
      setSyncEnabled(storedSync === 'true');
      setProfileId(getOrCreateProfileId());
    }
  }, []);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    const loadRemoteFacts = async () => {
      setSyncError(null);
      setSyncLoading(true);
      const response = await fetchRemoteFacts(profileId);
      if (cancelled) return;
      if (response.ok) {
        if (response.syncEnabled) {
          setGroups(response.groups);
          saveFactGroups(response.groups);
        }
        setSyncEnabled(response.syncEnabled);
        if (typeof window !== 'undefined') {
          localStorage.setItem(
            FACT_SYNC_STORAGE_KEY,
            response.syncEnabled ? 'true' : 'false'
          );
        }
      } else {
        setSyncError(response.message);
      }
      setSyncLoading(false);
    };

    void loadRemoteFacts();

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  useEffect(() => () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
    }
    if (pendingSyncRef.current) {
      clearTimeout(pendingSyncRef.current);
      pendingSyncRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!profileId || !syncEnabled) return;
    if (pendingSyncRef.current) {
      clearTimeout(pendingSyncRef.current);
    }
    pendingSyncRef.current = setTimeout(() => {
      void upsertRemoteFacts(profileId, groups, true).then((result) => {
        if (!result.ok) {
          setSyncError(result.message);
        }
        if (result.ok) {
          setSyncError(null);
        }
      });
    }, 750);

    return () => {
      if (pendingSyncRef.current) {
        clearTimeout(pendingSyncRef.current);
        pendingSyncRef.current = null;
      }
    };
  }, [groups, profileId, syncEnabled]);

  const availableCategories = useMemo(() => {
    const used = new Set(
      groups
        .map((group) =>
          FACT_CATEGORY_CONFIG.find((category) => category.label === group.name)?.id ?? null
        )
        .filter((value): value is string => Boolean(value))
    );
    return FACT_CATEGORY_CONFIG.filter((category) => !used.has(category.id));
  }, [groups]);

  useEffect(() => {
    if (availableCategories.length === 0) {
      setSelectedCategoryId('');
      return;
    }
    setSelectedCategoryId((prev) =>
      prev && availableCategories.some((category) => category.id === prev)
        ? prev
        : availableCategories[0].id
    );
  }, [availableCategories]);

  const selectedCategory = useMemo(
    () => FACT_CATEGORY_CONFIG.find((category) => category.id === selectedCategoryId) ?? null,
    [selectedCategoryId]
  );

  const handleAddGroup = () => {
    if (groups.length >= MAX_GROUPS) {
      setLimitNotice('Достигнут лимит созданных групп. Удалите существующую или используйте одну из них.');
      return;
    }
    if (!selectedCategory) {
      setErrors('Свободных категорий нет. Удалите одну из существующих групп.');
      return;
    }
    const group = createFactGroup(selectedCategory.label.slice(0, GROUP_NAME_LIMIT), newGroupColor);
    const updated = [...groups, group];
    setGroups(updated);
    saveFactGroups(updated);
    setErrors('');
  };

  const handleAddFact = (groupId: string, text: string): string | null => {
    const targetGroup = groups.find((group) => group.id === groupId);
    if (!targetGroup) return null;
    if (targetGroup.facts.length >= MAX_FACTS_PER_GROUP) {
      setLimitNotice(FACT_LIMIT_MESSAGE);
      return null;
    }
    const content = text.trim().slice(0, FACT_TEXT_LIMIT);
    if (!content) return null;

    let createdId: string | null = null;
    const updated = groups.map((group) => {
      if (group.id !== groupId) return group;
      const newFact = createFact(content);
      createdId = newFact.id;
      return { ...group, facts: [newFact, ...group.facts] };
    });

    if (!createdId) {
      return null;
    }

    setGroups(updated);
    saveFactGroups(updated);
    return createdId;
  };

  const handleSyncToggle = async () => {
    if (syncLoading) return;
    if (!profileId) {
      setSyncError('Не удалось определить ваш идентификатор. Обновите страницу и попробуйте снова.');
      return;
    }
    setSyncError(null);
    const target = !syncEnabled;
    setSyncLoading(true);

    if (pendingSyncRef.current) {
      clearTimeout(pendingSyncRef.current);
      pendingSyncRef.current = null;
    }

    if (target) {
      const remote = await fetchRemoteFacts(profileId);
      if (!remote.ok) {
        setSyncError(remote.message);
        setSyncLoading(false);
        return;
      }

      let nextGroups = groups;
      if (remote.groups.length > 0) {
        nextGroups = remote.groups;
        setGroups(remote.groups);
        saveFactGroups(remote.groups);
      }

      const upsert = await upsertRemoteFacts(profileId, nextGroups, true);
      if (!upsert.ok) {
        setSyncError(upsert.message);
        setSyncLoading(false);
        return;
      }

      setSyncEnabled(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem(FACT_SYNC_STORAGE_KEY, 'true');
      }
    } else {
      const upsert = await upsertRemoteFacts(profileId, groups, false);
      if (!upsert.ok) {
        setSyncError(upsert.message);
        setSyncLoading(false);
        return;
      }
      setSyncEnabled(false);
      if (typeof window !== 'undefined') {
        localStorage.setItem(FACT_SYNC_STORAGE_KEY, 'false');
      }
    }

    setSyncLoading(false);
  };

  const handleUpdateFact = (groupId: string, factId: string, text: string) => {
    let changed = false;
    const updated = groups.map((group) => {
      if (group.id !== groupId) return group;

      let innerChanged = false;
      const facts = group.facts.map((fact) => {
        if (fact.id !== factId) return fact;
        const sanitized = text.trim().slice(0, FACT_TEXT_LIMIT);
        if (fact.text === sanitized) return fact;
        innerChanged = true;
        return { ...fact, text: sanitized };
      });

      if (!innerChanged) return group;
      changed = true;
      return { ...group, facts };
    });

    if (!changed) return;
    setGroups(updated);
    saveFactGroups(updated);
  };

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const scheduleHold = (target: HoldTarget) => {
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      setHoldTarget(target);
      holdTimerRef.current = null;
    }, 400);
  };

  const cancelHoldPreparation = () => {
    if (!holdTarget) {
      clearHoldTimer();
    }
  };

  const handleHoldConfirm = () => {
    if (!holdTarget) return;
    if (holdTarget.type === 'group') {
      const updated = groups.filter((group) => group.id !== holdTarget.groupId);
      setGroups(updated);
      saveFactGroups(updated);
    } else {
      const updated = groups.map((group) => {
        if (group.id !== holdTarget.groupId) return group;
        return {
          ...group,
          facts: group.facts.filter((fact) => fact.id !== holdTarget.factId),
        };
      });
      setGroups(updated);
      saveFactGroups(updated);
    }
    setHoldTarget(null);
    clearHoldTimer();
  };

  const handleHoldCancel = () => {
    setHoldTarget(null);
    clearHoldTimer();
  };

  const handleGroupPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    groupId: string
  ) => {
    if (holdTarget) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const element = event.target as HTMLElement;
    if (element.closest('textarea')) return;
    scheduleHold({ type: 'group', groupId });
  };

  const handleFactPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    groupId: string,
    factId: string
  ) => {
    if (holdTarget) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const element = event.target as HTMLElement;
    if (element.closest('textarea')) return;
    scheduleHold({ type: 'fact', groupId, factId });
  };

  const handlePointerUp = () => {
    if (!holdTarget) {
      cancelHoldPreparation();
    }
  };

  const interactionsLocked = Boolean(holdTarget);
  const heldEntity = useMemo(() => {
    if (!holdTarget) return null;
    if (holdTarget.type === 'group') {
      const group = groups.find((item) => item.id === holdTarget.groupId);
      return group ? { label: group.name, type: 'group' as const } : null;
    }
    const group = groups.find((item) => item.id === holdTarget.groupId);
    const fact = group?.facts.find((item) => item.id === holdTarget.factId);
    if (!group || !fact) return null;
    return { label: fact.text || 'Факт', type: 'fact' as const };
  }, [groups, holdTarget]);

  useEffect(() => {
    if (holdTarget && !heldEntity) {
      setHoldTarget(null);
    }
  }, [heldEntity, holdTarget]);

  return (
    <Layout>
      <div className="px-4 py-8 max-w-5xl mx-auto transition">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold">Мои факты</h1>
          <p className="text-xs text-slate-500">
            Зажмите группу или факт, чтобы удалить его.
          </p>
        </div>

        <div className="mb-6 flex flex-col gap-3 rounded-xl bg-gray-800 p-4 shadow md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Синхронизация фактов</h2>
            <p className="text-sm text-slate-400">
              Включите, чтобы хранить факты в Supabase и автоматически получать их на других устройствах.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSyncToggle}
            disabled={syncLoading || !profileId}
            className={`inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold transition ${
              syncEnabled
                ? 'bg-primary text-slate-900 hover:bg-secondary'
                : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
            } ${syncLoading || !profileId ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            {syncLoading
              ? 'Синхронизация...'
              : syncEnabled
                ? 'Выключить синхронизацию'
                : 'Включить синхронизацию'}
          </button>
        </div>

        {syncError && (
          <p className="mb-6 text-sm text-red-400">{syncError}</p>
        )}

        <div className="mb-8 rounded-xl bg-gray-800 p-4 shadow">
          <h2 className="mb-4 text-xl font-semibold">Добавить группу фактов</h2>
          {errors && <p className="mb-2 text-sm text-red-500">{errors}</p>}
          <div className="flex flex-col space-y-3 md:flex-row md:items-end md:space-x-4 md:space-y-0">
            <div className="flex-1">
              <label className="mb-1 block text-sm" htmlFor="groupCategory">
                Категория
              </label>
              <select
                id="groupCategory"
                value={selectedCategoryId}
                onChange={(event) => {
                  setSelectedCategoryId(event.target.value);
                  setErrors('');
                }}
                disabled={interactionsLocked || availableCategories.length === 0}
                className={`w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary ${
                  interactionsLocked || availableCategories.length === 0
                    ? 'cursor-not-allowed opacity-50'
                    : ''
                }`}
              >
                {availableCategories.length === 0 ? (
                  <option value="">Свободных категорий нет</option>
                ) : (
                  availableCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm" htmlFor="groupColor">
                Цвет
              </label>
              <div className="grid grid-cols-5 gap-2">
                {COLOR_OPTIONS.map((option) => {
                  const active = option.value === newGroupColor;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={interactionsLocked}
                      onClick={() => setNewGroupColor(option.value)}
                      className={`h-10 w-16 rounded-md border transition ${
                        interactionsLocked
                          ? 'cursor-not-allowed border-gray-700 opacity-40'
                          : active
                            ? 'border-primary shadow-[0_0_0.75rem_rgba(20,244,255,0.6)]'
                            : 'border-gray-700 hover:border-primary/60 hover:shadow-[0_0_0.75rem_rgba(20,244,255,0.35)]'
                      }`}
                      style={{ backgroundColor: option.value }}
                      aria-label={`Выбрать цвет ${option.label}`}
                    />
                  );
                })}
              </div>
            </div>
            <button
              onClick={handleAddGroup}
              disabled={interactionsLocked || availableCategories.length === 0}
              className={`rounded-md px-5 py-2 text-sm font-medium transition-colors ${
                interactionsLocked || availableCategories.length === 0
                  ? 'cursor-not-allowed bg-primary/30 text-background/50'
                  : 'bg-primary text-background hover:bg-secondary'
              }`}
            >
              Добавить группу
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {groups.map((group) => {
            const requestFocus = focusRequest?.groupId === group.id ? focusRequest.factId : null;
            const factLimitReached = group.facts.length >= MAX_FACTS_PER_GROUP;
            const groupHeld = holdTarget?.type === 'group' && holdTarget.groupId === group.id;
            return (
              <section
                key={group.id}
                onPointerDown={(event) => handleGroupPointerDown(event, group.id)}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className={`rounded-xl bg-gray-800 p-4 shadow transition ${
                  groupHeld ? 'ring-2 ring-red-500/60 bg-gray-900/60' : ''
                }`}
              >
                <header className="mb-4 flex items-start justify-between">
                  <h3 className="text-lg font-semibold" style={{ color: group.color }}>
                    {group.name}
                  </h3>
                </header>

                <div className="space-y-3">
                  <FactQuickAdd
                    accentColor={group.color}
                    onCommit={(value) => handleAddFact(group.id, value)}
                    onFocusRequest={(factId) => setFocusRequest({ groupId: group.id, factId })}
                    disabled={interactionsLocked}
                    limitReached={factLimitReached}
                    onLimitNotice={() => setLimitNotice(FACT_LIMIT_MESSAGE)}
                  />
                  {group.facts.length === 0 ? (
                    <p className="text-sm text-gray-400">
                      Список фактов появится здесь, как только вы начнёте их добавлять.
                    </p>
                  ) : (
                    group.facts.map((fact) => (
                      <EditableFactRow
                        key={fact.id}
                        value={fact.text}
                        accentColor={group.color}
                        autoFocus={requestFocus === fact.id}
                        onFocusComplete={() => setFocusRequest(null)}
                        onChange={(value) => handleUpdateFact(group.id, fact.id, value)}
                        onPointerDown={(event) => handleFactPointerDown(event, group.id, fact.id)}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                        holding={holdTarget?.type === 'fact' && holdTarget.factId === fact.id}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {holdTarget && heldEntity && (
        <HoldOverlay
          type={heldEntity.type}
          label={heldEntity.label}
          onConfirm={handleHoldConfirm}
          onCancel={handleHoldCancel}
        />
      )}
      {limitNotice && <LimitDialog message={limitNotice} onClose={() => setLimitNotice(null)} />}
    </Layout>
  );
}

function FactQuickAdd({
  onCommit,
  onFocusRequest,
  accentColor,
  disabled,
  limitReached,
  onLimitNotice,
}: {
  onCommit: (value: string) => string | null;
  onFocusRequest: (factId: string) => void;
  accentColor: string;
  disabled: boolean;
  limitReached: boolean;
  onLimitNotice: () => void;
}) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    adjustTextareaHeight(textareaRef.current);
  }, [value]);

  useEffect(() => {
    if (!limitReached) return;
    if (value) {
      setValue('');
    }
    textareaRef.current?.blur();
  }, [limitReached, value]);

  const handleAttemptLimitNotice = useCallback(() => {
    if (!limitReached) return;
    onLimitNotice();
  }, [limitReached, onLimitNotice]);

  const handleMouseDown = (event: React.MouseEvent<HTMLTextAreaElement>) => {
    if (!limitReached) return;
    event.preventDefault();
    handleAttemptLimitNotice();
  };

  const handleFocus = () => {
    if (!limitReached) return;
    handleAttemptLimitNotice();
    requestAnimationFrame(() => textareaRef.current?.blur());
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!limitReached) return;
    if (event.key === 'Tab') {
      return;
    }
    event.preventDefault();
    handleAttemptLimitNotice();
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (disabled || limitReached) {
      if (limitReached) {
        handleAttemptLimitNotice();
      }
      return;
    }
    const nextValue = event.target.value.slice(0, FACT_TEXT_LIMIT);
    setValue(nextValue);

    if (!nextValue.trim()) {
      return;
    }

    const newId = onCommit(nextValue);
    if (!newId) {
      return;
    }

    setValue('');
    textareaRef.current?.blur();
    onFocusRequest(newId);
  };

  const isDisabled = disabled || limitReached;

  return (
    <textarea
      ref={textareaRef}
      value={value}
      rows={1}
      onChange={handleChange}
      maxLength={FACT_TEXT_LIMIT}
      onMouseDown={handleMouseDown}
      onFocus={handleFocus}
      onKeyDown={(event) => {
        if (limitReached) {
          handleKeyDown(event);
        }
      }}
      placeholder="Нажмите и начните печатать новый факт"
      disabled={disabled}
      readOnly={disabled || limitReached}
      className={`w-full resize-none rounded-md border border-dashed px-3 py-2 text-sm outline-none transition-colors ${
        isDisabled
          ? 'cursor-not-allowed border-gray-700 bg-gray-800/70 text-gray-500 placeholder:text-gray-600'
          : 'border-gray-600 bg-transparent text-gray-300 focus:border-current focus:text-gray-100'
      }`}
      style={{
        borderColor: isDisabled ? '#475569' : accentColor,
      }}
    />
  );
}

function EditableFactRow({
  value,
  onChange,
  accentColor,
  autoFocus,
  onFocusComplete,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  holding,
}: {
  value: string;
  onChange: (text: string) => void;
  accentColor: string;
  autoFocus: boolean;
  onFocusComplete: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  holding: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleResize = useCallback(() => {
    adjustTextareaHeight(textareaRef.current);
  }, []);

  useEffect(() => {
    handleResize();
  }, [value, handleResize]);

  useEffect(() => {
    if (!autoFocus) return;
    const node = textareaRef.current;
    if (!node) return;
    node.focus();
    const length = node.value.length;
    node.setSelectionRange(length, length);
    onFocusComplete();
  }, [autoFocus, onFocusComplete]);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value.slice(0, FACT_TEXT_LIMIT);
    onChange(next);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerLeave}
      className={`flex items-start gap-3 rounded-md border border-gray-700 bg-gray-700/60 px-3 py-2 transition ${
        holding ? 'border-red-400 bg-red-500/10 shadow-lg shadow-red-500/20' : ''
      }`}
      style={{ borderLeft: `4px solid ${accentColor}` }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        rows={1}
        maxLength={FACT_TEXT_LIMIT}
        className={`flex-1 resize-none bg-transparent text-sm text-gray-100 outline-none transition-colors ${
          holding ? 'cursor-default text-gray-200' : 'focus:text-gray-100'
        }`}
      />
    </div>
  );
}

function LimitDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-6 text-gray-100 shadow-lg">
        <p className="text-sm">{message}</p>
        <button
          onClick={onClose}
          className="mt-6 w-full rounded-md bg-primary py-2 text-sm font-medium text-background transition-colors hover:bg-secondary"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

function HoldOverlay({
  type,
  label,
  onConfirm,
  onCancel,
}: {
  type: 'group' | 'fact';
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-start gap-6 bg-slate-950/85 px-6 pt-16 text-slate-100 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20 text-red-300">
          <Trash2 className="h-10 w-10" />
        </span>
        <div className="space-y-1">
          <p className="text-lg font-semibold">
            {type === 'group' ? 'Удалить группу?' : 'Удалить факт?'}
          </p>
          <p className="max-w-xs text-sm text-slate-300">{label}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-full border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-400 hover:text-slate-100 sm:w-auto"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="w-full rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-red-400 sm:w-auto"
        >
          Удалить
        </button>
      </div>
    </div>
  );
}

function adjustTextareaHeight(node: HTMLTextAreaElement | null) {
  if (!node) return;
  node.style.height = 'auto';
  node.style.height = `${node.scrollHeight}px`;
}
