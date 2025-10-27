import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const MAX_GROUPS = 3;
const MAX_FACTS_PER_GROUP = 5;
const FACT_LIMIT_MESSAGE =
  'В этой группе достигнут лимит фактов. Удалите один, чтобы добавить новый.';

type FocusRequest = { groupId: string; factId: string } | null;

/**
 * Facts management page. Users can create groups of facts and quickly
 * capture long-form facts straight from a phone without extra buttons.
 * The state persists in localStorage until backend integration is added.
 */
export default function FactsPage() {
  const [groups, setGroups] = useState<FactGroup[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [errors, setErrors] = useState('');
  const [deleteMode, setDeleteMode] = useState(false);
  const [pendingGroupDeletes, setPendingGroupDeletes] = useState<Set<string>>(
    () => new Set<string>()
  );
  const [pendingFactDeletes, setPendingFactDeletes] = useState<Set<string>>(
    () => new Set<string>()
  );
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);

  useEffect(() => {
    setGroups(loadFactGroups());
  }, []);

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
    if (deleteMode) return;
    if (groups.length >= MAX_GROUPS) {
      setLimitNotice('Достигнут лимит созданных групп. Удалите существующую или используйте одну из них.');
      return;
    }
    if (!selectedCategory) {
      setErrors('Свободных категорий нет. Удалите одну из существующих групп.');
      return;
    }
    const group = createFactGroup(selectedCategory.label, selectedCategory.color);
    const updated = [...groups, group];
    setGroups(updated);
    saveFactGroups(updated);
    setErrors('');
  };

  const resetPendingDeletes = () => {
    setPendingGroupDeletes(new Set<string>());
    setPendingFactDeletes(new Set<string>());
  };

  const handleAddFact = (groupId: string, text: string): string | null => {
    if (deleteMode) return null;
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

  const toggleGroupSelection = (groupId: string, checked: boolean) => {
    setPendingGroupDeletes((prev) => {
      const next = new Set(prev);
      if (checked) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
  };

  const toggleFactSelection = (factId: string, checked: boolean) => {
    setPendingFactDeletes((prev) => {
      const next = new Set(prev);
      if (checked) next.add(factId);
      else next.delete(factId);
      return next;
    });
  };

  const handleDeleteClick = () => {
    if (!deleteMode) {
      setDeleteMode(true);
      resetPendingDeletes();
      return;
    }

    if (!pendingGroupDeletes.size && !pendingFactDeletes.size) {
      setDeleteMode(false);
      resetPendingDeletes();
      return;
    }

    const updated = groups
      .filter((group) => !pendingGroupDeletes.has(group.id))
      .map((group) => ({
        ...group,
        facts: group.facts.filter((fact) => !pendingFactDeletes.has(fact.id)),
      }));

    setGroups(updated);
    saveFactGroups(updated);
    setDeleteMode(false);
    resetPendingDeletes();
  };

  return (
    <Layout>
      <div
        className={`px-4 py-8 max-w-5xl mx-auto transition ${
          deleteMode ? 'bg-gray-950/40' : ''
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Мои факты</h1>
          <button
            type="button"
            onClick={handleDeleteClick}
            className={`flex items-center space-x-2 rounded-full border px-3 py-2 text-sm transition-colors ${
              deleteMode
                ? 'border-red-500 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200'
                : 'border-gray-600 text-gray-300 hover:border-gray-500 hover:text-gray-100'
            }`}
          >
            <Trash2 className="h-4 w-4" />
            <span>Удалить</span>
          </button>
        </div>

        {deleteMode && (
          <p className="mb-4 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-gray-300">
            Выберите факты или группы, после чего снова нажмите «Удалить», чтобы удалить выбранное.
          </p>
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
                disabled={deleteMode || availableCategories.length === 0}
                className={`w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary ${
                  deleteMode || availableCategories.length === 0 ? 'cursor-not-allowed opacity-50' : ''
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
            {selectedCategory && (
              <div className="flex items-center gap-3 rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-200">
                <span>Предпросмотр</span>
                <span
                  className="h-8 w-8 rounded-full"
                  style={{ backgroundColor: selectedCategory.color }}
                  aria-hidden
                />
              </div>
            )}
            <button
              onClick={handleAddGroup}
              disabled={deleteMode || !selectedCategory || availableCategories.length === 0}
              className={`rounded-md px-5 py-2 text-sm font-medium transition-colors ${
                deleteMode || !selectedCategory || availableCategories.length === 0
                  ? 'cursor-not-allowed bg-primary/30 text-background/50'
                  : 'bg-primary text-background hover:bg-secondary'
              }`}
            >
              Добавить группу
            </button>
          </div>
          {availableCategories.length === 0 && (
            <p className="mt-2 text-xs text-slate-400">
              Все категории уже используются. Удалите одну из групп, чтобы освободить место.
            </p>
          )}
        </div>

        <div className="space-y-6">
          {groups.map((group) => {
            const requestFocus = focusRequest?.groupId === group.id ? focusRequest.factId : null;
            const groupMarked = pendingGroupDeletes.has(group.id);
            const factLimitReached = group.facts.length >= MAX_FACTS_PER_GROUP;
            return (
              <section
                key={group.id}
                className={`rounded-xl bg-gray-800 p-4 shadow transition ${
                  deleteMode ? 'border border-gray-700 bg-gray-800/70' : ''
                } ${groupMarked ? 'ring-1 ring-red-500/60' : ''}`}
              >
                <header className="mb-4 flex items-start justify-between">
                  <h3 className="text-lg font-semibold" style={{ color: group.color }}>
                    {group.name}
                  </h3>
                  <DeleteToggle
                    active={deleteMode}
                    checked={groupMarked}
                    onChange={(checked) => toggleGroupSelection(group.id, checked)}
                    label="Пометить группу для удаления"
                  />
                </header>

                <div className="space-y-3">
                  <FactQuickAdd
                    accentColor={group.color}
                    onCommit={(value) => handleAddFact(group.id, value)}
                    onFocusRequest={(factId) => setFocusRequest({ groupId: group.id, factId })}
                    disabled={deleteMode}
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
                        deleteMode={deleteMode}
                        selected={pendingFactDeletes.has(fact.id)}
                        onSelectChange={(checked) => toggleFactSelection(fact.id, checked)}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
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
  };

  const commitValue = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        return false;
      }
      const newId = onCommit(trimmed);
      if (!newId) {
        return false;
      }
      setValue('');
      textareaRef.current?.blur();
      onFocusRequest(newId);
      return true;
    },
    [onCommit, onFocusRequest]
  );

  const handleBlur = () => {
    if (disabled || limitReached) return;
    commitValue(value);
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
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          commitValue(value || event.currentTarget.value);
          return;
        }
      }}
      onBlur={handleBlur}
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
  deleteMode,
  selected,
  onSelectChange,
}: {
  value: string;
  onChange: (text: string) => void;
  accentColor: string;
  autoFocus: boolean;
  onFocusComplete: () => void;
  deleteMode: boolean;
  selected: boolean;
  onSelectChange: (checked: boolean) => void;
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
      className={`flex items-start gap-3 rounded-md border border-gray-700 bg-gray-700/60 px-3 py-2 transition ${
        deleteMode ? 'bg-gray-700/80 text-gray-200' : ''
      } ${selected ? 'border-red-400 bg-red-500/10' : ''}`}
      style={{ borderLeft: `4px solid ${deleteMode ? '#475569' : accentColor}` }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        rows={1}
        maxLength={FACT_TEXT_LIMIT}
        readOnly={deleteMode}
        className={`flex-1 resize-none bg-transparent text-sm text-gray-100 outline-none transition-colors ${
          deleteMode ? 'cursor-not-allowed text-gray-400' : 'focus:text-gray-100'
        }`}
      />
      <DeleteToggle
        active={deleteMode}
        checked={selected}
        onChange={onSelectChange}
        label="Пометить факт для удаления"
      />
    </div>
  );
}

function DeleteToggle({
  active,
  checked,
  onChange,
  label,
}: {
  active: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  if (!active) return null;

  return (
    <label className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-gray-600 text-xs transition hover:border-red-400 hover:text-red-400">
      <span className="sr-only">{label}</span>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        className="flex h-3 w-3 items-center justify-center rounded-full border border-gray-500 transition peer-checked:border-none peer-checked:bg-red-500"
        aria-hidden
      />
    </label>
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

function adjustTextareaHeight(node: HTMLTextAreaElement | null) {
  if (!node) return;
  node.style.height = 'auto';
  node.style.height = `${node.scrollHeight}px`;
}
