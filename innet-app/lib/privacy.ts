import type { PlanEntitlements } from './plans';

export type PrivacyLevel = 'public' | 'second-degree' | 'direct-only';

const PRIVACY_STORAGE_KEY = 'innet_contact_privacy_level';
const DEFAULT_PRIVACY: PrivacyLevel = 'public';

declare global {
  interface WindowEventMap {
    'innet-privacy-updated': Event;
  }
}

export function mapPrivacyLevel(value: string | null | undefined): PrivacyLevel {
  switch ((value ?? '').toLowerCase()) {
    case 'second-degree':
      return 'second-degree';
    case 'direct-only':
      return 'direct-only';
    default:
      return 'public';
  }
}

export function allowedPrivacyLevels(entitlements: PlanEntitlements): PrivacyLevel[] {
  const base: PrivacyLevel[] = ['public', 'second-degree'];
  if (entitlements.allowFullPrivacy) {
    base.push('direct-only');
  }
  return base;
}

export function sanityCheckPrivacyLevel(level: PrivacyLevel, entitlements: PlanEntitlements): PrivacyLevel {
  const allowed = allowedPrivacyLevels(entitlements);
  if (allowed.includes(level)) {
    return level;
  }
  return DEFAULT_PRIVACY;
}

export function getPrivacyLevel(): PrivacyLevel {
  if (typeof window === 'undefined') {
    return DEFAULT_PRIVACY;
  }
  return mapPrivacyLevel(localStorage.getItem(PRIVACY_STORAGE_KEY));
}

export function setPrivacyLevel(level: PrivacyLevel): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PRIVACY_STORAGE_KEY, level);
  window.dispatchEvent(new Event('innet-privacy-updated'));
}

export function subscribeToPrivacyChanges(listener: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const handler = () => listener();
  window.addEventListener('innet-privacy-updated', handler);
  const storageHandler = (event: StorageEvent) => {
    if (event.key === PRIVACY_STORAGE_KEY || event.key === null) {
      handler();
    }
  };
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener('innet-privacy-updated', handler);
    window.removeEventListener('storage', storageHandler);
  };
}

export const PRIVACY_STORAGE_KEY_NAME = PRIVACY_STORAGE_KEY;
