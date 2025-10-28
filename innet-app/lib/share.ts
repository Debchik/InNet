import { v4 as uuidv4 } from 'uuid';
import {
  Contact,
  ContactGroup,
  createContact,
  FACT_TEXT_LIMIT,
  loadContacts,
  saveContacts,
} from './storage';

export const SHARE_PREFIX = 'innet-share:';
export const SHARE_VERSION = 1;
export const MAX_SHARE_TOKEN_SIZE = 4096; // Soft threshold to keep QR-коды пригодными для сканирования

export interface ShareFact {
  id: string;
  text: string;
}

export interface ShareGroup {
  id: string;
  name: string;
  color: string;
  facts: ShareFact[];
}

export interface SharePayload {
  v: number;
  owner: {
    id: string;
    name: string;
    avatar?: string;
    phone?: string;
    telegram?: string;
    instagram?: string;
  };
  groups: ShareGroup[];
  generatedAt: number;
}

export interface MergeResult {
  contact: Contact;
  wasCreated: boolean;
  addedFacts: number;
}

export function buildShareUrl(token: string, originOverride?: string): string {
  if (!token) return '';
  const vercelHost = process.env.NEXT_PUBLIC_VERCEL_URL;
  const envOrigin =
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (vercelHost ? `https://${vercelHost.replace(/^https?:\/\//, '')}` : '') ||
    '';
  const origin =
    originOverride ||
    (typeof window !== 'undefined' ? window.location.origin : undefined) ||
    envOrigin ||
    'https://innet.app';
  if (!origin) {
    return token;
  }
  const normalizedOrigin = origin.replace(/\/$/, '');
  return `${normalizedOrigin}/share?token=${token}`;
}

export function extractShareToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(SHARE_PREFIX)) {
    return trimmed;
  }

  if (/^innet-share%3A/i.test(trimmed)) {
    const decodedFromEscaped = decodeCandidate(trimmed);
    if (decodedFromEscaped) {
      return decodedFromEscaped;
    }
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const tokenParam = url.searchParams.get('token');
      if (tokenParam) {
        const decoded = decodeCandidate(tokenParam);
        if (decoded) return decoded;
      }

      const path = url.pathname.startsWith('/') ? url.pathname : `/${url.pathname}`;
      if (path.startsWith('/share/')) {
        const slug = path.slice('/share/'.length);
        const decoded = decodeCandidate(slug);
        if (decoded) return decoded;
      }
    } catch {
      // Ignore URL parse errors and fall through.
    }
  }

  const queryMatch = trimmed.match(/[?&]token=([^&]+)/);
  if (queryMatch && queryMatch[1]) {
    const decoded = decodeCandidate(queryMatch[1]);
    if (decoded) return decoded;
  }

  if (!trimmed.includes('://')) {
    const candidate = decodeCandidate(trimmed);
    if (candidate && candidate.startsWith(SHARE_PREFIX)) {
      return candidate;
    }
  }

  return null;
}

export function generateShareToken(payload: SharePayload): string {
  const json = JSON.stringify(sanitizePayload(payload));
  const token = SHARE_PREFIX + base64UrlEncode(json);
  if (token.length > MAX_SHARE_TOKEN_SIZE && typeof console !== 'undefined') {
    console.warn(
      `Share token length ${token.length} превышает мягкий лимит ${MAX_SHARE_TOKEN_SIZE}. ` +
        'QR-код всё равно создан, но убедитесь, что он считывается корректно.'
    );
  }
  return token;
}

export function parseShareToken(token: string): SharePayload {
  if (!token.startsWith(SHARE_PREFIX)) {
    throw new Error('Неподдерживаемый формат QR-кода.');
  }
  const encoded = token.slice(SHARE_PREFIX.length);
  const json = base64UrlDecode(encoded);
  const parsed = JSON.parse(json) as SharePayload;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Не удалось разобрать данные QR-кода.');
  }
  if (parsed.v !== SHARE_VERSION) {
    throw new Error('Версия QR-кода не поддерживается.');
  }
  return sanitizePayload(parsed);
}

export function mergeContactFromShare(payload: SharePayload): MergeResult {
  const contacts = loadContacts();
  const existing = contacts.find((contact) => contact.remoteId === payload.owner.id);

  if (!existing) {
    const contact = createContact({
      remoteId: payload.owner.id,
      name: payload.owner.name || 'Новый контакт',
      avatar: payload.owner.avatar,
      phone: payload.owner.phone,
      telegram: payload.owner.telegram,
      instagram: payload.owner.instagram,
      groups: payload.groups,
    });
    saveContacts([contact, ...contacts]);
    return { contact, wasCreated: true, addedFacts: countFacts(payload.groups) };
  }

  const { updatedContact, addedFacts } = mergeExistingContact(existing, payload);
  const updatedList = contacts.map((contact) =>
    contact.id === existing.id ? updatedContact : contact
  );
  saveContacts(updatedList);

  return { contact: updatedContact, wasCreated: false, addedFacts };
}

export function getOrCreateProfileId(): string {
  if (typeof window === 'undefined') {
    return uuidv4();
  }
  const key = 'innet_profile_uid';
  const legacyKey = 'innet_profile_id';
  const existing = localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
  if (existing) {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, existing);
    }
    return existing;
  }
  const generated = uuidv4();
  localStorage.setItem(key, generated);
  return generated;
}

function mergeExistingContact(contact: Contact, payload: SharePayload): {
  updatedContact: Contact;
  addedFacts: number;
} {
  const incomingGroups = payload.groups.map((group) => ({
    ...group,
    facts: group.facts.map((fact) => ({
      ...fact,
      text: fact.text.slice(0, FACT_TEXT_LIMIT),
    })),
  }));

  const map = new Map<string, ContactGroup>(
    contact.groups.map((group) => [group.id, { ...group, facts: [...group.facts] }])
  );

  let additions = 0;
  incomingGroups.forEach((group) => {
    const existingGroup = map.get(group.id);
    if (!existingGroup) {
      map.set(group.id, {
        id: group.id,
        name: group.name,
        color: group.color,
        facts: group.facts.map((fact) => ({ ...fact })),
      });
      additions += group.facts.length;
      return;
    }

    const factTexts = new Set(existingGroup.facts.map((fact) => fact.text));
    group.facts.forEach((fact) => {
      if (fact.text && !factTexts.has(fact.text)) {
        existingGroup.facts.push({
          id: fact.id || uuidv4(),
          text: fact.text.slice(0, FACT_TEXT_LIMIT),
        });
        factTexts.add(fact.text);
        additions += 1;
      }
    });
    existingGroup.name = group.name || existingGroup.name;
    existingGroup.color = group.color || existingGroup.color;
  });

  return {
    addedFacts: additions,
    updatedContact: {
      ...contact,
      name: payload.owner.name || contact.name,
      avatar: payload.owner.avatar ?? contact.avatar,
      phone: payload.owner.phone ?? contact.phone,
      telegram: payload.owner.telegram ?? contact.telegram,
      instagram: payload.owner.instagram ?? contact.instagram,
      lastUpdated: Date.now(),
      groups: Array.from(map.values()),
    },
  };
}

function sanitizePayload(payload: SharePayload): SharePayload {
  return {
    v: SHARE_VERSION,
    owner: {
      id: payload.owner?.id || uuidv4(),
      name: payload.owner?.name?.toString().trim().slice(0, 64) || 'Новый контакт',
      // Do NOT include heavy or non-shareable avatar values into the QR payload.
      // Data URLs, blob URLs or arbitrary strings explode token size and break QR generation.
      // Only allow compact http(s) URLs of reasonable length; drop everything else.
      avatar: sanitizeAvatar(payload.owner?.avatar),
      phone: sanitizeContactField(payload.owner?.phone),
      telegram: sanitizeContactField(payload.owner?.telegram),
      instagram: sanitizeContactField(payload.owner?.instagram),
    },
    generatedAt: typeof payload.generatedAt === 'number' ? payload.generatedAt : Date.now(),
    groups: (payload.groups || []).map((group) => ({
      id: group?.id?.toString() || uuidv4(),
      name: group?.name?.toString().slice(0, 64) || 'Группа фактов',
      color: group?.color?.toString() || '#475569',
      facts: (group?.facts || [])
        .map((fact) => ({
          id: fact?.id?.toString() || uuidv4(),
          text: fact?.text?.toString().trim().slice(0, FACT_TEXT_LIMIT) || '',
        }))
        .filter((fact) => fact.text),
    })),
  };
}

function decodeCandidate(raw: string): string {
  if (!raw) return '';
  let candidate = raw.trim();
  if (!candidate) return '';

  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    // ignore decode errors, use raw candidate
  }

  const normalized = candidate.trim();
  if (!normalized) {
    return '';
  }

  if (normalized.startsWith(SHARE_PREFIX)) {
    return normalized;
  }

  const prefixIndex = normalized.indexOf(SHARE_PREFIX);
  if (prefixIndex >= 0) {
    return normalized.slice(prefixIndex);
  }

  if (/^innet-share%3A/i.test(normalized)) {
    const rest = normalized.replace(/^innet-share%3A/i, '');
    return SHARE_PREFIX + rest;
  }

  return normalized ? `${SHARE_PREFIX}${normalized}` : '';
}

function base64UrlEncode(input: string): string {
  if (typeof window === 'undefined') {
    return Buffer.from(input, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const bytes = encoder ? encoder.encode(input) : toUtf8Array(input);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  const base64 = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return base64;
}

function base64UrlDecode(input: string): string {
  let normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) {
    normalized += '=';
  }

  if (typeof window === 'undefined') {
    return Buffer.from(normalized, 'base64').toString('utf8');
  }

  const binary = atob(normalized);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }

  return utf8ArrayToString(bytes);
}

function countFacts(groups: ShareGroup[]): number {
  return groups.reduce((acc, group) => acc + group.facts.length, 0);
}

function sanitizeContactField(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 64);
}

// Keep QR payloads small: only allow compact, shareable avatars.
// - Disallow data: and blob: URLs
// - Require http(s) URLs
// - Limit length to avoid QR overflow even with many facts
function sanitizeAvatar(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^(data:|blob:)/i.test(trimmed)) return undefined;
  if (!/^https?:\/\//i.test(trimmed)) return undefined;
  if (trimmed.length > 256) return undefined;
  return trimmed;
}

function toUtf8Array(str: string): Uint8Array {
  const utf8: number[] = [];
  for (let i = 0; i < str.length; i += 1) {
    let charCode = str.charCodeAt(i);
    if (charCode < 0x80) {
      utf8.push(charCode);
    } else if (charCode < 0x800) {
      utf8.push(0xc0 | (charCode >> 6));
      utf8.push(0x80 | (charCode & 0x3f));
    } else if (charCode < 0xd800 || charCode >= 0xe000) {
      utf8.push(0xe0 | (charCode >> 12));
      utf8.push(0x80 | ((charCode >> 6) & 0x3f));
      utf8.push(0x80 | (charCode & 0x3f));
    } else {
      i += 1;
      charCode = 0x10000 + (((charCode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      utf8.push(0xf0 | (charCode >> 18));
      utf8.push(0x80 | ((charCode >> 12) & 0x3f));
      utf8.push(0x80 | ((charCode >> 6) & 0x3f));
      utf8.push(0x80 | (charCode & 0x3f));
    }
  }
  return new Uint8Array(utf8);
}

function utf8ArrayToString(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const c = bytes[i++];
    if (c < 0x80) {
      out += String.fromCharCode(c);
    } else if (c < 0xe0) {
      const char2 = bytes[i++];
      out += String.fromCharCode(((c & 0x1f) << 6) | (char2 & 0x3f));
    } else if (c < 0xf0) {
      const char2 = bytes[i++];
      const char3 = bytes[i++];
      out += String.fromCharCode(((c & 0x0f) << 12) | ((char2 & 0x3f) << 6) | (char3 & 0x3f));
    } else {
      const char2 = bytes[i++];
      const char3 = bytes[i++];
      const char4 = bytes[i++];
      let codePoint =
        ((c & 0x07) << 18) |
        ((char2 & 0x3f) << 12) |
        ((char3 & 0x3f) << 6) |
        (char4 & 0x3f);
      codePoint -= 0x10000;
      out += String.fromCharCode(0xd800 + (codePoint >> 10));
      out += String.fromCharCode(0xdc00 + (codePoint & 0x3ff));
    }
  }
  return out;
}
