import type { Contact } from './storage';

export type ReminderCadenceUnit = 'week' | 'month';

export type ReminderSettings = {
  enabled: boolean;
  cadence: {
    value: number;
    unit: ReminderCadenceUnit;
  };
  /**
   * Percentage (0..1) used to randomise the interval around the baseline.
   */
  jitterPercent?: number;
};

export type ContactReminderSchedule = {
  contactId: string;
  contactName: string;
  nextReminderAt: number | null;
  lastNotifiedAt?: number | null;
  disabled?: boolean;
};

export type ReminderState = {
  contactSchedules: Record<string, ContactReminderSchedule>;
  /**
   * Tracks how many reminders были показаны в конкретные даты (YYYY-MM-DD).
   */
  dailyReminderLog?: Record<string, number>;
};

export const REMINDER_SETTINGS_KEY = 'innet_reminder_settings';
export const REMINDER_STATE_KEY = 'innet_reminder_state';
export const REMINDER_SETTINGS_UPDATED_EVENT = 'innet-reminder-settings-updated';

const DEFAULT_JITTER_PERCENT = 0.35;
const MAX_WEEKS = 12;
const MAX_MONTHS = 12;

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  cadence: {
    value: 2,
    unit: 'week',
  },
  jitterPercent: DEFAULT_JITTER_PERCENT,
};

export const DEFAULT_REMINDER_STATE: ReminderState = {
  contactSchedules: {},
  dailyReminderLog: {},
};

export function normalizeReminderSettings(raw: ReminderSettings | null | undefined): ReminderSettings {
  const base = raw ?? DEFAULT_REMINDER_SETTINGS;
  const unit = base.cadence?.unit === 'month' ? 'month' : 'week';
  const rawValue = Number(base.cadence?.value ?? DEFAULT_REMINDER_SETTINGS.cadence.value);
  const maxValue = unit === 'week' ? MAX_WEEKS : MAX_MONTHS;
  const value = clamp(Math.round(rawValue) || DEFAULT_REMINDER_SETTINGS.cadence.value, 1, maxValue);
  const jitter =
    typeof base.jitterPercent === 'number' && base.jitterPercent > 0
      ? Math.min(base.jitterPercent, 0.75)
      : DEFAULT_JITTER_PERCENT;

  return {
    enabled: Boolean(base.enabled),
    cadence: { unit, value },
    jitterPercent: jitter,
  };
}

export function loadReminderSettings(): ReminderSettings {
  if (typeof window === 'undefined') return DEFAULT_REMINDER_SETTINGS;
  try {
    const raw = window.localStorage.getItem(REMINDER_SETTINGS_KEY);
    if (!raw) return DEFAULT_REMINDER_SETTINGS;
    const parsed = JSON.parse(raw) as ReminderSettings | null;
    return normalizeReminderSettings(parsed ?? undefined);
  } catch (error) {
    console.error('[reminders] Failed to parse reminder settings', error);
    return DEFAULT_REMINDER_SETTINGS;
  }
}

export function saveReminderSettings(settings: ReminderSettings): void {
  if (typeof window === 'undefined') return;
  const normalized = normalizeReminderSettings(settings);
  window.localStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(normalized));
}

export function loadReminderState(): ReminderState {
  if (typeof window === 'undefined') return DEFAULT_REMINDER_STATE;
  try {
    const raw = window.localStorage.getItem(REMINDER_STATE_KEY);
    if (!raw) return DEFAULT_REMINDER_STATE;
    const parsed = JSON.parse(raw) as ReminderState | LegacyReminderState | null;
    return migrateReminderState(parsed ?? null);
  } catch (error) {
    console.error('[reminders] Failed to parse reminder state', error);
    return DEFAULT_REMINDER_STATE;
  }
}

export function saveReminderState(state: ReminderState): void {
  if (typeof window === 'undefined') return;
  const payload: ReminderState = {
    contactSchedules: state.contactSchedules ?? {},
    dailyReminderLog: state.dailyReminderLog ?? {},
  };
  window.localStorage.setItem(REMINDER_STATE_KEY, JSON.stringify(payload));
}

export function computeNextReminderTimestamp(
  settings: ReminderSettings,
  referenceDate = Date.now()
): number {
  const normalized = normalizeReminderSettings(settings);
  const base = computeBaseIntervalMs(normalized);
  const jitter = normalized.jitterPercent ?? DEFAULT_JITTER_PERCENT;
  const factor = randomBetween(1 - jitter, 1 + jitter);
  const daytimeOffset = randomBetween(2 * HOUR, 18 * HOUR);
  return referenceDate + Math.max(1, Math.floor(base * factor)) + daytimeOffset;
}

export function computeSnoozeTimestamp(referenceDate = Date.now()): number {
  // Сдвигаем на 2-5 дней вперёд с небольшим разбросом по времени.
  const min = 2 * DAY;
  const max = 5 * DAY;
  const span = randomBetween(min, max);
  const offset = randomBetween(1 * HOUR, 12 * HOUR);
  return referenceDate + span + offset;
}

export function ensureScheduleForContact(
  contact: Contact,
  state: ReminderState,
  settings: ReminderSettings,
  referenceDate = Date.now()
): ContactReminderSchedule {
  const existing = state.contactSchedules[contact.id];
  if (existing) {
    // Обновим имя, если оно изменилось.
    if (existing.contactName !== contact.name) {
      existing.contactName = contact.name;
    }
    return existing;
  }
  const schedule: ContactReminderSchedule = {
    contactId: contact.id,
    contactName: contact.name,
    nextReminderAt: computeNextReminderTimestamp(settings, referenceDate),
    lastNotifiedAt: null,
    disabled: false,
  };
  state.contactSchedules[contact.id] = schedule;
  return schedule;
}

export function cleanupMissingSchedules(state: ReminderState, contacts: Contact[]): void {
  const ids = new Set(contacts.map((contact) => contact.id));
  Object.keys(state.contactSchedules).forEach((contactId) => {
    if (!ids.has(contactId)) {
      delete state.contactSchedules[contactId];
    }
  });
}

export function getDailyReminderCount(state: ReminderState, dayKey: string): number {
  return state.dailyReminderLog?.[dayKey] ?? 0;
}

export function setDailyReminderCount(
  state: ReminderState,
  dayKey: string,
  count: number
): void {
  if (!state.dailyReminderLog) {
    state.dailyReminderLog = {};
  }
  state.dailyReminderLog[dayKey] = count;
}

export function pruneDailyReminderLog(
  log: Record<string, number> | undefined,
  keepDays = 30
): Record<string, number> {
  if (!log) return {};
  const cutoff = Date.now() - keepDays * DAY;
  const next: Record<string, number> = {};
  Object.entries(log).forEach(([key, value]) => {
    const timestamp = Date.parse(key);
    if (!Number.isNaN(timestamp) && timestamp >= cutoff) {
      next[key] = value;
    }
  });
  return next;
}

export function formatDayKey(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function computeBaseIntervalMs(settings: ReminderSettings): number {
  const cadence = settings.cadence ?? DEFAULT_REMINDER_SETTINGS.cadence;
  const value = Math.max(1, Math.round(cadence.value));
  if (cadence.unit === 'month') {
    return value * APPROX_MONTH;
  }
  return value * WEEK;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const APPROX_MONTH = 30 * DAY;

function randomBetween(min: number, max: number): number {
  const safeMin = Math.min(min, max);
  const safeMax = Math.max(min, max);
  if (safeMin === safeMax) return safeMin;
  const span = safeMax - safeMin;
  return safeMin + Math.floor(Math.random() * span);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type LegacyReminderState = {
  nextReminderAt?: number | null;
  lastReminderAt?: number | null;
  lastContactId?: string | null;
  lastContactName?: string | null;
};

function migrateReminderState(raw: ReminderState | LegacyReminderState | null): ReminderState {
  if (!raw) return { ...DEFAULT_REMINDER_STATE };
  if ('contactSchedules' in raw) {
    return {
      contactSchedules: raw.contactSchedules ?? {},
      dailyReminderLog: raw.dailyReminderLog ?? {},
    };
  }
  // Legacy structure: convert to new format.
  const schedules: Record<string, ContactReminderSchedule> = {};
  const contactId =
    raw && typeof raw.lastContactId === 'string' ? raw.lastContactId : undefined;
  if (contactId) {
    schedules[contactId] = {
      contactId,
      contactName: typeof raw?.lastContactName === 'string' ? raw.lastContactName : 'Контакт',
      nextReminderAt: ensureNumberOrNull(raw?.nextReminderAt) ?? null,
      lastNotifiedAt: ensureNumberOrNull(raw?.lastReminderAt) ?? null,
      disabled: false,
    };
  }
  return {
    contactSchedules: schedules,
    dailyReminderLog: {},
  };
}

function ensureNumberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return value;
}
