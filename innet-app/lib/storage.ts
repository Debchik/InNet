import { v4 as uuidv4 } from 'uuid';
import { FACT_CATEGORY_CONFIG, FACT_CATEGORY_LABELS, FACT_CATEGORY_COLORS } from './categories';

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
export const FACT_TEXT_LIMIT = 128;
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
}

export interface GraphData {
  nodes: { id: string; name: string; avatar?: string; }[];
  links: { source: string; target: string; }[];
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
  const nodes = [
    { id: currentUserId, name: 'Вы', avatar: undefined },
    ...contacts.map((c) => ({ id: c.id, name: c.name, avatar: c.avatar }))
  ];
  const links = contacts.map((c) => ({ source: currentUserId, target: c.id }));
  return { nodes, links };
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
export function createFact(text: string): Fact {
  const value = (text ?? '').toString().trim().slice(0, FACT_TEXT_LIMIT);
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
}): Contact {
  const id = uuidv4();
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
