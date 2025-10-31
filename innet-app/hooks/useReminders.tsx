import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ReminderSettings,
  ReminderState,
  ContactReminderSchedule,
  loadReminderSettings,
  saveReminderSettings,
  loadReminderState,
  saveReminderState,
  computeNextReminderTimestamp,
  computeSnoozeTimestamp,
  normalizeReminderSettings,
  REMINDER_SETTINGS_KEY,
  REMINDER_STATE_KEY,
  REMINDER_SETTINGS_UPDATED_EVENT,
  ensureScheduleForContact,
  cleanupMissingSchedules,
  formatDayKey,
  getDailyReminderCount,
  setDailyReminderCount,
  pruneDailyReminderLog,
} from '../lib/reminders';
import { loadContacts, type Contact } from '../lib/storage';

type PermissionStatus = NotificationPermission | 'unsupported';

type ReminderContextValue = {
  settings: ReminderSettings;
  updateSettings: (value: ReminderSettings | ((prev: ReminderSettings) => ReminderSettings)) => void;
  permission: PermissionStatus;
  requestPermission: () => Promise<PermissionStatus>;
  triggerTestReminder: () => Promise<Contact | null>;
  nextReminderPreview: number | null;
  lastReminderMeta: { name: string; at: number } | null;
  activeSchedulesCount: number;
  dailyLimit: number;
};

type ReminderQueueItem = {
  contact: Contact;
  schedule: ContactReminderSchedule;
  mode: 'auto' | 'test';
  deliveredAt: number;
};

const ReminderContext = createContext<ReminderContextValue | null>(null);
const DAILY_LIMIT = 2;
const SNOOZE_KEEP_DAYS = 45;

export function ReminderProvider({ children }: { children: ReactNode }) {
  const isNotificationSupported =
    typeof window !== 'undefined' && typeof Notification !== 'undefined';

  const [settings, setSettings] = useState<ReminderSettings>(() => loadReminderSettings());
  const [state, setState] = useState<ReminderState>(() => loadReminderState());
  const [permission, setPermission] = useState<PermissionStatus>(() =>
    isNotificationSupported ? Notification.permission : 'unsupported'
  );
  const [pendingQueue, setPendingQueue] = useState<ReminderQueueItem[]>([]);
  const [activePrompt, setActivePrompt] = useState<ReminderQueueItem | null>(null);

  const stateRef = useRef<ReminderState>(state);
  const settingsRef = useRef<ReminderSettings>(settings);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const persistState = useCallback((recipe: (draft: ReminderState) => ReminderState | void) => {
    setState((prev) => {
      const draft: ReminderState = {
        contactSchedules: { ...prev.contactSchedules },
        dailyReminderLog: pruneDailyReminderLog(prev.dailyReminderLog, SNOOZE_KEEP_DAYS),
      };
      const result = recipe(draft) ?? draft;
      saveReminderState(result);
      stateRef.current = result;
      return result;
    });
  }, []);

  const updateSettings = useCallback(
    (value: ReminderSettings | ((prev: ReminderSettings) => ReminderSettings)) => {
      setSettings((prev) => {
        const nextRaw = typeof value === 'function' ? value(prev) : value;
        const next = normalizeReminderSettings(nextRaw);
        if (typeof window !== 'undefined') {
          saveReminderSettings(next);
          window.dispatchEvent(new Event(REMINDER_SETTINGS_UPDATED_EVENT));
        }
        // Пересчитаем график напоминаний под новые параметры.
        const contacts = typeof window !== 'undefined' ? loadContacts() : [];
        if (contacts.length) {
          persistState((draft) => {
            cleanupMissingSchedules(draft, contacts);
            const reference = Date.now();
            contacts.forEach((contact) => {
              const schedule = ensureScheduleForContact(contact, draft, next, reference);
              if (!schedule.disabled && next.enabled) {
                schedule.nextReminderAt = computeNextReminderTimestamp(next, reference);
              }
            });
            return draft;
          });
        }
        return next;
      });
    },
    [persistState]
  );

  const requestPermission = useCallback(async (): Promise<PermissionStatus> => {
    if (!isNotificationSupported) {
      setPermission('unsupported');
      return 'unsupported';
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch (error) {
      console.warn('[reminders] Failed to request notification permission', error);
      setPermission('denied');
      return 'denied';
    }
  }, [isNotificationSupported]);

  const pickRandomContact = useCallback((contacts: Contact[]): Contact | null => {
    if (!contacts.length) return null;
    const index = Math.floor(Math.random() * contacts.length);
    return contacts[index] ?? null;
  }, []);

  const openContactCard = useCallback((contact: Contact) => {
    if (typeof window === 'undefined') return;
    try {
      const url = `${window.location.origin}/app/contacts/${contact.id}`;
      window.open(url, '_blank', 'noopener');
    } catch {
      // ignore navigation errors
    }
  }, []);

  const enqueueReminder = useCallback(
    (contact: Contact, schedule: ContactReminderSchedule, mode: 'auto' | 'test') => {
      const now = Date.now();

      if (mode === 'auto') {
        persistState((draft) => {
          const entry = draft.contactSchedules[contact.id];
          if (!entry || entry.disabled) return draft;
          entry.lastNotifiedAt = now;
          entry.nextReminderAt = computeNextReminderTimestamp(settingsRef.current, now);
          const dayKey = formatDayKey(now);
          const count = getDailyReminderCount(draft, dayKey);
          setDailyReminderCount(draft, dayKey, count + 1);
          return draft;
        });
      }

      const latestSchedule =
        stateRef.current.contactSchedules[contact.id] ?? schedule;
      setPendingQueue((prev) => [...prev, { contact, schedule: latestSchedule, mode, deliveredAt: now }]);

      if (isNotificationSupported && permission === 'granted') {
        try {
          const notification = new Notification(`Напомни о себе ${contact.name}`, {
            body: buildNotificationBody(contact),
            tag: `innet-reminder-${contact.id}`,
          });
          notification.onclick = () => {
            window.focus();
            openContactCard(contact);
            notification.close();
          };
        } catch (error) {
          console.warn('[reminders] Failed to show browser notification', error);
        }
      } else if (typeof window !== 'undefined') {
        const isPageVisible =
          typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;
        if (isPageVisible) {
          window.alert(`Напомни о себе ${contact.name}\n\n${buildNotificationBody(contact)}`);
        } else {
          console.info('[reminders]', `Напомни о себе ${contact.name}`);
        }
      }
    },
    [isNotificationSupported, openContactCard, permission, persistState]
  );

  const evaluateReminders = useCallback(() => {
    if (!settingsRef.current.enabled) return;
    if (typeof window === 'undefined') return;

    const contacts = loadContacts();
    const map = new Map<string, Contact>(contacts.map((contact) => [contact.id, contact]));

    const currentState = stateRef.current;
    const working: ReminderState = {
      contactSchedules: { ...currentState.contactSchedules },
      dailyReminderLog: pruneDailyReminderLog(currentState.dailyReminderLog, SNOOZE_KEEP_DAYS),
    };
    const reference = Date.now();
    cleanupMissingSchedules(working, contacts);
    contacts.forEach((contact) => {
      ensureScheduleForContact(contact, working, settingsRef.current, reference);
    });

    persistState(() => working);

    const dayKey = formatDayKey(reference);
    let remaining = Math.max(0, DAILY_LIMIT - getDailyReminderCount(working, dayKey));
    if (remaining <= 0) return;

    const due = Object.values(working.contactSchedules)
      .filter(
        (schedule) =>
          !schedule.disabled &&
          typeof schedule.nextReminderAt === 'number' &&
          schedule.nextReminderAt <= reference
      )
      .sort((a, b) => {
        const aNext = a.nextReminderAt ?? Number.POSITIVE_INFINITY;
        const bNext = b.nextReminderAt ?? Number.POSITIVE_INFINITY;
        return aNext - bNext;
      });

    for (const schedule of due) {
      if (remaining <= 0) break;
      const contact = map.get(schedule.contactId);
      if (!contact) continue;
      remaining -= 1;
      enqueueReminder(contact, schedule, 'auto');
    }
  }, [enqueueReminder, persistState]);

  const triggerTestReminder = useCallback(async () => {
    if (typeof window === 'undefined') return null;
    const contacts = loadContacts();
    if (!contacts.length) return null;

    const enabledContacts = contacts.filter((contact) => {
      const schedule = stateRef.current.contactSchedules[contact.id];
      return !schedule?.disabled;
    });

    const pool = enabledContacts.length ? enabledContacts : contacts;
    const contact = pickRandomContact(pool);
    if (!contact) return null;

    persistState((draft) => {
      ensureScheduleForContact(contact, draft, settingsRef.current, Date.now());
      return draft;
    });

    const schedule = stateRef.current.contactSchedules[contact.id];
    if (!schedule) return null;

    enqueueReminder(contact, schedule, 'test');
    return contact;
  }, [enqueueReminder, pickRandomContact, persistState]);

  useEffect(() => {
    if (!activePrompt && pendingQueue.length > 0) {
      const [next, ...rest] = pendingQueue;
      setActivePrompt(next);
      setPendingQueue(rest);
    }
  }, [activePrompt, pendingQueue]);

  const handlePromptAction = useCallback(
    (item: ReminderQueueItem | null, action: 'complete' | 'snooze' | 'disable' | 'open') => {
      if (!item) return;
      const contact = item.contact;
      if (action === 'open') {
        openContactCard(contact);
        return;
      }

      if (action === 'snooze') {
        persistState((draft) => {
          const entry = draft.contactSchedules[contact.id];
          if (!entry) return draft;
          entry.disabled = false;
          entry.nextReminderAt = computeSnoozeTimestamp();
          return draft;
        });
      } else if (action === 'disable') {
        persistState((draft) => {
          const entry = draft.contactSchedules[contact.id];
          if (!entry) return draft;
          entry.disabled = true;
          entry.nextReminderAt = null;
          return draft;
        });
      }

      setActivePrompt(null);
    },
    [openContactCard, persistState]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const run = () => evaluateReminders();
    if (settings.enabled) {
      run();
    }
    const id = window.setInterval(run, 60_000);
    return () => {
      window.clearInterval(id);
    };
  }, [evaluateReminders, settings.enabled]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === REMINDER_SETTINGS_KEY) {
        setSettings(loadReminderSettings());
      }
      if (event.key === REMINDER_STATE_KEY) {
        setState(loadReminderState());
      }
    };
    const handleCustom = () => {
      setSettings(loadReminderSettings());
      setState(loadReminderState());
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(REMINDER_SETTINGS_UPDATED_EVENT, handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(REMINDER_SETTINGS_UPDATED_EVENT, handleCustom);
    };
  }, []);

  useEffect(() => {
    if (!isNotificationSupported) return;
    const id = window.setInterval(() => {
      setPermission(Notification.permission);
    }, 90_000);
    return () => {
      window.clearInterval(id);
    };
  }, [isNotificationSupported]);

  const nextReminderPreview = useMemo(() => {
    const entries = Object.values(state.contactSchedules).filter(
      (entry) => !entry.disabled && typeof entry.nextReminderAt === 'number'
    );
    if (!entries.length) return null;
    return entries.reduce<number | null>((min, entry) => {
      if (min === null) return entry.nextReminderAt ?? null;
      if (entry.nextReminderAt && entry.nextReminderAt < min) return entry.nextReminderAt;
      return min;
    }, null);
  }, [state.contactSchedules]);

  const lastReminderMeta = useMemo(() => {
    let result: { name: string; at: number } | null = null;
    Object.values(state.contactSchedules).forEach((entry) => {
      if (!entry.lastNotifiedAt) return;
      if (!result || entry.lastNotifiedAt > result.at) {
        result = { name: entry.contactName, at: entry.lastNotifiedAt };
      }
    });
    return result;
  }, [state.contactSchedules]);

  const activeSchedulesCount = useMemo(() => {
    return Object.values(state.contactSchedules).filter((entry) => !entry.disabled).length;
  }, [state.contactSchedules]);

  const contextValue = useMemo<ReminderContextValue>(
    () => ({
      settings,
      updateSettings,
      permission,
      requestPermission,
      triggerTestReminder,
      nextReminderPreview,
      lastReminderMeta,
      activeSchedulesCount,
      dailyLimit: DAILY_LIMIT,
    }),
    [
      activeSchedulesCount,
      lastReminderMeta,
      nextReminderPreview,
      permission,
      requestPermission,
      settings,
      triggerTestReminder,
      updateSettings,
    ]
  );

  return (
    <ReminderContext.Provider value={contextValue}>
      {children}
      <ReminderPrompt
        item={activePrompt}
        onAction={(action) => handlePromptAction(activePrompt, action)}
        onNext={() => {
          setActivePrompt(null);
        }}
      />
    </ReminderContext.Provider>
  );
}

export function useReminders() {
  const context = useContext(ReminderContext);
  if (!context) {
    throw new Error('useReminders must be used within a ReminderProvider');
  }
  return context;
}

function ReminderPrompt({
  item,
  onAction,
  onNext,
}: {
  item: ReminderQueueItem | null;
  onAction: (action: 'complete' | 'snooze' | 'disable' | 'open') => void;
  onNext: () => void;
}) {
  useEffect(() => {
    if (!item) return;
    return () => {
      onNext();
    };
  }, [item, onNext]);

  if (!item) return null;
  const { contact } = item;
  return (
    <div className="fixed bottom-6 right-6 z-[1200] w-80 max-w-[calc(100%-2rem)] transition duration-200">
      <div className="rounded-2xl border border-primary/40 bg-gray-900/95 p-5 shadow-2xl backdrop-blur">
        <p className="text-xs uppercase tracking-wide text-primary/80">Пора связаться</p>
        <h3 className="mt-1 text-lg font-semibold text-white">{contact.name}</h3>
        <div className="mt-2 space-y-1 text-xs text-gray-300">
          {contact.phone && <p>Телефон: {contact.phone}</p>}
          {contact.telegram && <p>Telegram: {contact.telegram}</p>}
          {contact.instagram && <p>Instagram: {contact.instagram}</p>}
          {!contact.phone && !contact.telegram && !contact.instagram && (
            <p>Напомните о себе любым удобным способом.</p>
          )}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-background transition hover:bg-secondary"
            onClick={() => onAction('complete')}
          >
            Я написал
          </button>
          <button
            type="button"
            className="w-full rounded-md border border-primary/40 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/10"
            onClick={() => onAction('snooze')}
          >
            Напомнить позже
          </button>
          <button
            type="button"
            className="w-full rounded-md border border-gray-700 px-4 py-2 text-xs font-medium text-gray-400 transition hover:border-gray-500 hover:text-gray-200"
            onClick={() => onAction('disable')}
          >
            Больше не напоминать
          </button>
        </div>
        <button
          type="button"
          className="mt-3 w-full text-xs font-medium text-primary/80 transition hover:text-primary"
          onClick={() => onAction('open')}
        >
          Открыть карточку
        </button>
      </div>
    </div>
  );
}

function buildNotificationBody(contact: Contact): string {
  const lines = [
    `Пора написать ${contact.name}.`,
    contact.phone ? `Телефон: ${contact.phone}` : null,
    contact.telegram ? `Telegram: ${contact.telegram}` : null,
    contact.instagram ? `Instagram: ${contact.instagram}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}
