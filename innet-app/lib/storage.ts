import { v4 as uuidv4 } from 'uuid';

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

export interface Contact {
  id: string;
  name: string;
  avatar?: string;
  connectedAt: number;
  receivedGroups: string[];
}

export interface GraphData {
  nodes: { id: string; name: string; avatar?: string; }[];
  links: { source: string; target: string; }[];
}

/* Key names used for persisting to localStorage */
const FACT_KEY = 'innet_fact_groups';
const CONTACT_KEY = 'innet_contacts';

/**
 * Load fact groups from localStorage. If none exist, returns an empty
 * array. Each call parses the stored JSON and returns typed objects.
 */
export function loadFactGroups(): FactGroup[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FACT_KEY);
    if (!raw) return [];
    const stored = JSON.parse(raw) as any[];
    return Array.isArray(stored) ? stored.map(normalizeFactGroup) : [];
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
    return JSON.parse(raw) as Contact[];
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
  return { id: uuidv4(), text };
}

/**
 * Create a new contact record. The `receivedGroups` array should contain
 * the IDs of groups shared by the contact when they were added.
 */
export function createContact(name: string, receivedGroups: string[], avatar?: string): Contact {
  return { id: uuidv4(), name, avatar, receivedGroups, connectedAt: Date.now() };
}

// TODO: Add persistence helpers for remote storage.
// When integrating a backend, replace localStorage usage with API
// calls (e.g. GraphQL or REST) and synchronize responses back into
// your React state. For now, this module isolates all storage
// concerns making it easier to swap implementations later.

function normalizeFactGroup(raw: any): FactGroup {
  const id = typeof raw?.id === 'string' ? raw.id : uuidv4();
  const name = typeof raw?.name === 'string' ? raw.name : 'Без названия';
  const color = typeof raw?.color === 'string' ? raw.color : '#0D9488';
  const facts: Fact[] = Array.isArray(raw?.facts)
    ? raw.facts.map(normalizeFact).filter(Boolean) as Fact[]
    : [];
  return { id, name, color, facts };
}

function normalizeFact(raw: any): Fact | null {
  if (raw == null) return null;
  const id = typeof raw.id === 'string' ? raw.id : uuidv4();

  if (typeof raw.text === 'string') {
    return { id, text: raw.text };
  }

  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  const combined = [title, description].filter(Boolean).join(description && title ? '\n' : '');

  if (!combined) {
    return { id, text: '' };
  }

  return { id, text: combined };
}
