import { v4 as uuidv4 } from 'uuid';
import { FACT_CATEGORY_CONFIG, FACT_CATEGORY_LABELS, FACT_CATEGORY_COLORS } from './categories';
import type { PlanId, PlanProduct } from './plans';

/**
 * Types describing the core domain entities for InNet.
 * Fact groups contain a collection of individual facts. Contacts
 * reference a user in the network with their own fact selections.
 * The graph is derived from contacts; each user has a node and edges
 * represent mutual connections.
 */
export interface Fact {
  id: string;
  text: string;
}

export interface FactGroup {
  id: string;
  name: string;
  color: string;
  facts: Fact[];
}
export const FACT_TEXT_LIMIT = 4000;
export const CONTACT_NOTE_LIMIT = 128;
export const CONTACT_NOTE_MAX = 7;

export interface ContactGroup {
  id: string;
  name: string;
  color: string;
  facts: Fact[];
}

export interface ContactNote {
  id: string;
  text: string;
  createdAt: number;
}

export interface ContactTag {
  id: string;
  label: string;
  color: string;
}

export const CONTACT_TAG_COLOR_PRESETS = [
  '#38BDF8',
  '#FB923C',
  '#22C55E',
  '#A855F7',
  '#F472B6',
  '#14B8A6',
  '#FACC15',
] as const;

function pickTagColor(seed?: string): string {
  if (seed && seed.startsWith('#') && (seed.length === 7 || seed.length === 9)) {
    return seed;
  }
  const index = Math.floor(Math.random() * CONTACT_TAG_COLOR_PRESETS.length);
  return CONTACT_TAG_COLOR_PRESETS[index];
}

export function createContactTag(label: string, color?: string): ContactTag {
  const normalizedLabel = (label ?? '').toString().trim();
  if (!normalizedLabel) {
    throw new Error('Тег должен содержать название');
  }
  return {
    id: uuidv4(),
    label: normalizedLabel,
    color: pickTagColor(color),
  };
}

export interface ContactConnection {
  id: string;
  name: string;
  avatar?: string;
}

export interface Contact {
  id: string;
  remoteId: string;
  name: string;
  avatar?: string;
  phone?: string;
  telegram?: string;
  instagram?: string;
  connectedAt: number;
  lastUpdated: number;
  groups: ContactGroup[];
  notes: ContactNote[];
  tags: ContactTag[];
  connections?: ContactConnection[];
}

export interface GraphData {
  nodes: { id: string; name: string; avatar?: string; level?: number; tagColor?: string }[];
  links: { source: string; target: string }[];
}

export interface UserAccount {
  id: string;
  email: string;
  password: string;
  name: string;
  surname?: string;
  avatar?: string;
  avatarType?: 'preset' | 'upload';
  categories: string[];
  factsByCategory: Record<string, string[]>;
  phone?: string;
  telegram?: string;
  instagram?: string;
  createdAt: number;
  verified: boolean;
  pendingVerificationCode?: string;
  quickSignup?: boolean;
  plan?: PlanId;
  planActivatedAt?: number;
  planProduct?: PlanProduct | null;
  planExpiresAt?: number | null;
  supabaseUid?: string | null;
}

/* Key names used for persisting to localStorage */
const FACT_KEY = 'innet_fact_groups';
const CONTACT_KEY = 'innet_contacts';
const USER_KEY = 'innet_users';

/**
 * Load fact groups from localStorage. If none exist, returns an empty
 * array. Each call parses the stored JSON and returns typed objects.
 */
export function loadFactGroups(): FactGroup[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FACT_KEY);
    if (!raw) return [];
    const stored = JSON.parse(raw) as unknown;
    if (!Array.isArray(stored)) return [];
    return stored.map((item) => normalizeFactGroup(item));
  } catch (err) {
    console.error('Failed to parse fact groups', err);
    return [];
  }
}

/**
 * Persist the supplied fact groups to localStorage.  Use this after
 * creating, updating or deleting groups to ensure the UI stays in sync
 * after reload.
 */
export function saveFactGroups(groups: FactGroup[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FACT_KEY, JSON.stringify(groups));
}

export function normalizeFactGroups(raw: unknown): FactGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => normalizeFactGroup(item));
}

/**
 * Load contacts from localStorage. Returns an empty array if none exist.
 */
export function loadContacts(): Contact[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CONTACT_KEY);
    if (!raw) return [];
    const stored = JSON.parse(raw) as unknown;
    if (!Array.isArray(stored)) return [];
    return stored
      .map((item) => normalizeContact(item))
      .filter((contact): contact is Contact => contact != null);
  } catch (err) {
    console.error('Failed to parse contacts', err);
    return [];
  }
}

/**
 * Persist contacts to localStorage. Call this after modifying the
 * contacts array to ensure persistence across sessions.
 */
export function saveContacts(contacts: Contact[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CONTACT_KEY, JSON.stringify(contacts));
}

const CATEGORY_CONFIG_MAP = FACT_CATEGORY_CONFIG.reduce<Record<string, { label: string; color: string }>>(
  (acc, config) => {
    acc[config.id] = { label: config.label, color: config.color };
    return acc;
  },
  {}
);

export function loadUsers(): UserAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to parse users', err);
    return [];
  }
}

export function saveUsers(users: UserAccount[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_KEY, JSON.stringify(users));
}

export function convertFactsToGroups(factsByCategory: Record<string, string[]>): FactGroup[] {
  const groups: FactGroup[] = [];

  Object.entries(factsByCategory).forEach(([categoryId, rawFacts]) => {
    const facts = rawFacts
      .map((fact) => fact.trim())
      .filter((fact) => fact.length > 0)
      .slice(0, 5);

    if (!facts.length) return;

    const config = CATEGORY_CONFIG_MAP[categoryId];
    const label = config?.label ?? FACT_CATEGORY_LABELS[categoryId] ?? 'Факты';
    const color =
      config?.color ?? FACT_CATEGORY_COLORS[categoryId] ?? '#6366F1';

    const group = createFactGroup(label, color);
    group.facts = facts.map((fact) => createFact(fact));
    groups.push(group);
  });

  return groups;
}

/**
 * Generate a graph representation of the contact list. Each contact
 * becomes a node. For simplicity all nodes are connected to the
 * current user (assumed id 'me'), though edges can be extended later.
 */
export function buildGraphData(currentUserId: string, contacts: Contact[]): GraphData {
  const nodes = new Map<string, { id: string; name: string; avatar?: string; level?: number; tagColor?: string }>();
  const links: GraphData['links'] = [];

  nodes.set(currentUserId, { id: currentUserId, name: 'Вы', avatar: undefined, level: 0, tagColor: '#38BDF8' });

  contacts.forEach((contact) => {
    nodes.set(contact.id, {
      id: contact.id,
      name: contact.name,
      avatar: contact.avatar,
      level: 1,
      tagColor: contact.tags[0]?.color,
    });
    links.push({ source: currentUserId, target: contact.id });

    const secondary = contact.connections ?? [];
    secondary.forEach((connection) => {
      const connectionId = connection.id;
      if (!connectionId) return;

      if (!nodes.has(connectionId)) {
        nodes.set(connectionId, {
          id: connectionId,
          name: connection.name,
          avatar: connection.avatar,
          level: 2,
        });
      }

      links.push({ source: contact.id, target: connectionId });
    });
  });

  return {
    nodes: Array.from(nodes.values()),
    links,
  };
}

/**
 * Create a new fact group with the provided name and optional color.
 * Assigns a unique ID for the group and each fact should have its own ID.
 */
export function createFactGroup(name: string, color: string): FactGroup {
  return { id: uuidv4(), name, color, facts: [] };
}

/**
 * Create a new fact within an existing group.
 */
export function createFact(text: string, limit?: number | null): Fact {
  const normalized = (text ?? '').toString().trim();
  let effectiveLimit: number | null;
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    effectiveLimit = limit;
  } else if (limit === null) {
    effectiveLimit = null;
  } else {
    effectiveLimit = FACT_TEXT_LIMIT;
  }
  const value = effectiveLimit ? normalized.slice(0, effectiveLimit) : normalized;
  return { id: uuidv4(), text: value };
}

/**
 * Create a new contact record based on the payload received from QR обмена.
 * Stores a copy of всех групп и фактов, которыми поделился собеседник.
 */
export function createContact(data: {
  remoteId: string;
  name: string;
  avatar?: string;
  phone?: string;
  telegram?: string;
  instagram?: string;
  groups: ContactGroup[];
  tags?: ContactTag[];
}): Contact {
  const id = uuidv4();
  const normalizedTags = Array.isArray(data.tags)
    ? data.tags
        .map((tag) => normalizeContactTag(tag))
        .filter((tag): tag is ContactTag => tag != null)
    : [];
  return {
    id,
    remoteId: data.remoteId,
    name: data.name,
    avatar: data.avatar,
    phone: data.phone,
    telegram: data.telegram,
    instagram: data.instagram,
    connectedAt: Date.now(),
    lastUpdated: Date.now(),
    groups: data.groups.map((group) => normalizeContactGroup(group)),
    tags: normalizedTags,
    notes: [],
  };
}

export function createContactNote(text: string): ContactNote {
  const value = (text ?? '').toString().trim().slice(0, CONTACT_NOTE_LIMIT);
  return {
    id: uuidv4(),
    text: value,
    createdAt: Date.now(),
  };
}

export function updateContact(updated: Contact): void {
  const contacts = loadContacts();
  const next = contacts.map((contact) => (contact.id === updated.id ? updated : contact));
  saveContacts(next);
}

// TODO: Add persistence helpers for remote storage.
// When integrating a backend, replace localStorage usage with API
// calls (e.g. GraphQL or REST) and synchronize responses back into
// your React state. For now, this module isolates all storage
// concerns making it easier to swap implementations later.

function normalizeFactGroup(raw: unknown): FactGroup {
  const record = toRecord(raw) ?? {};
  const id = isString(record.id) ? record.id : uuidv4();
  const name = isString(record.name) ? record.name : 'Без названия';
  const color = isString(record.color) ? record.color : '#0D9488';
  const factsSource = Array.isArray(record.facts) ? record.facts : [];
  const facts: Fact[] = factsSource
    .map((item) => normalizeFact(item))
    .filter((fact): fact is Fact => fact != null);
  return { id, name, color, facts };
}

function normalizeFact(raw: unknown): Fact | null {
  const record = toRecord(raw) ?? {};
  const id = isString(record.id) ? record.id : uuidv4();

  if (isString(record.text)) {
    return { id, text: record.text.trim().slice(0, FACT_TEXT_LIMIT) };
  }

  const title = isString(record.title) ? record.title.trim() : '';
  const description = isString(record.description) ? record.description.trim() : '';
  const combined = [title, description].filter(Boolean).join(description && title ? '\n' : '');

  if (!combined) {
    return { id, text: '' };
  }

  return { id, text: combined.slice(0, FACT_TEXT_LIMIT) };
}

function normalizeContact(raw: unknown): Contact | null {
  const record = toRecord(raw);
  if (!record) return null;

  const groupsSource = Array.isArray(record.groups) ? record.groups : [];
  const groups = groupsSource.map((group) => normalizeContactGroup(group));

  const legacyGroups = Array.isArray(record.receivedGroups)
    ? record.receivedGroups.filter(isString)
    : [];
  const notesSource = Array.isArray(record.notes) ? record.notes : [];
  const notes = notesSource
    .map((note) => normalizeContactNote(note))
    .filter((note): note is ContactNote => note != null);
  const tagsSource = Array.isArray(record.tags) ? record.tags : [];
  const tags = tagsSource
    .map((tag) => normalizeContactTag(tag))
    .filter((tag): tag is ContactTag => tag != null);

  const connectionsSource = Array.isArray(record.connections) ? record.connections : [];
  const connections = connectionsSource
    .map((connection) => normalizeContactConnection(connection))
    .filter((connection): connection is ContactConnection => connection != null);

  const remoteId =
    isString(record.remoteId) ? record.remoteId : isString(record.id) ? record.id : uuidv4();
  return {
    id: isString(record.id) ? record.id : uuidv4(),
    remoteId,
    name: isString(record.name) ? record.name : 'Без имени',
    avatar: isString(record.avatar) ? record.avatar : undefined,
    phone: isString(record.phone) ? record.phone : undefined,
    telegram: isString(record.telegram) ? record.telegram : undefined,
    instagram: isString(record.instagram) ? record.instagram : undefined,
    connectedAt: isNumber(record.connectedAt) ? record.connectedAt : Date.now(),
    lastUpdated: isNumber(record.lastUpdated) ? record.lastUpdated : Date.now(),
    groups: groups.length
      ? groups
      : legacyGroups.map((gid) => ({
          id: gid,
          name: 'Группа фактов',
          color: '#475569',
          facts: [],
        })),
    notes,
    tags,
    connections,
  };
}

function normalizeContactGroup(raw: unknown): ContactGroup {
  const record = toRecord(raw) ?? {};
  const id = isString(record.id) ? record.id : uuidv4();
  const name = isString(record.name) ? record.name : 'Группа фактов';
  const color = isString(record.color) ? record.color : '#475569';
  const factsSource = Array.isArray(record.facts) ? record.facts : [];
  const facts: Fact[] = factsSource
    .map((fact) => normalizeFact(fact))
    .filter((fact): fact is Fact => fact != null);
  return { id, name, color, facts };
}

function normalizeContactTag(raw: unknown): ContactTag | null {
  const record = toRecord(raw);
  if (!record) return null;
  const label = isString(record.label) ? record.label.trim() : '';
  if (!label) return null;
  const color = isString(record.color) ? record.color : undefined;
  return {
    id: isString(record.id) ? record.id : uuidv4(),
    label,
    color: pickTagColor(color),
  };
}

function normalizeContactNote(raw: unknown): ContactNote | null {
  const record = toRecord(raw);
  if (!record) return null;
  const text = isString(record.text) ? record.text.slice(0, CONTACT_NOTE_LIMIT) : '';
  if (!text) return null;
  return {
    id: isString(record.id) ? record.id : uuidv4(),
    text,
    createdAt: isNumber(record.createdAt) ? record.createdAt : Date.now(),
  };
}

function normalizeContactConnection(raw: unknown): ContactConnection | null {
  const record = toRecord(raw);
  if (!record) return null;
  const id = isString(record.id) ? record.id : uuidv4();
  const avatar = isString(record.avatar) ? record.avatar : undefined;
  const nameValue = isString(record.name) ? record.name.trim() : '';
  const name = nameValue || 'Контакт';
  return { id, name, avatar };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function createSeededRandom(seed?: number): () => number {
  let state = (typeof seed === 'number' && Number.isFinite(seed) ? seed : Date.now()) >>> 0;
  if (state === 0) {
    state = 0x1a2b3c4d;
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickUniqueIndices(total: number, desired: number, random: () => number): number[] {
  if (total <= 0 || desired <= 0) return [];
  const count = Math.min(desired, total);
  const selected = new Set<number>();
  while (selected.size < count) {
    const index = Math.floor(random() * total);
    selected.add(index);
  }
  return Array.from(selected);
}

const TEST_FIRST_NAMES = [
  'Алексей',
  'Мария',
  'Иван',
  'Татьяна',
  'Сергей',
  'Анастасия',
  'Никита',
  'Екатерина',
  'Павел',
  'Юлия',
  'Дмитрий',
  'Ольга',
  'Андрей',
  'Светлана',
  'Максим',
  'Ксения',
  'Владимир',
  'Ирина',
  'Михаил',
  'Елена',
];

const TEST_LAST_NAMES = [
  'Иванов',
  'Петрова',
  'Сидоров',
  'Кузнецова',
  'Смирнов',
  'Орлова',
  'Лебедев',
  'Соколова',
  'Федоров',
  'Васильева',
  'Морозов',
  'Волкова',
  'Новиков',
  'Борисова',
  'Ершов',
  'Семенова',
  'Зайцев',
  'Павлова',
  'Егоров',
  'Сергеев',
];

function generateTestName(random: () => number): string {
  const first =
    TEST_FIRST_NAMES[Math.floor(random() * TEST_FIRST_NAMES.length)] ?? TEST_FIRST_NAMES[0];
  const last =
    TEST_LAST_NAMES[Math.floor(random() * TEST_LAST_NAMES.length)] ?? TEST_LAST_NAMES[0];
  return `${first} ${last}`;
}

/**
 * Populate localStorage with synthetic contacts to quickly try the graph.
 * Generates 20 first-level connections and 10 second-level nodes that
 * attach to random first-level contacts. Existing contacts are replaced.
 */
export function seedTestContacts(seed?: number): Contact[] {
  if (typeof window === 'undefined') return [];
  const random = createSeededRandom(seed);
  const now = Date.now();

  const firstLevel = Array.from({ length: 20 }, () => {
    const id = uuidv4();
    return {
      id,
      remoteId: `remote-${id}`,
      name: generateTestName(random),
      connectedAt: now - Math.floor(random() * 14 * 24 * 60 * 60 * 1000),
      lastUpdated: now,
      groups: [],
      notes: [],
      tags: [],
      connections: [] as ContactConnection[],
    };
  });

  const secondLevel = Array.from({ length: 10 }, () => ({
    id: uuidv4(),
    name: generateTestName(random),
    avatar: undefined,
  }));

  secondLevel.forEach((connection) => {
    const attachments = pickUniqueIndices(
      firstLevel.length,
      1 + Math.floor(random() * 2),
      random
    );
    attachments.forEach((index) => {
      const contact = firstLevel[index];
      if (!contact) return;
      contact.connections = contact.connections ?? [];
      contact.connections.push({
        id: connection.id,
        name: connection.name,
        avatar: connection.avatar,
      });
    });
  });

  saveContacts(firstLevel);
  return firstLevel;
}
