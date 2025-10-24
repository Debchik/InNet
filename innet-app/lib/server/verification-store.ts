type VerificationEntry = {
  code: string;
  expiresAt: number;
};

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const store = new Map<string, VerificationEntry>();

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function createVerificationCode(email: string, ttlMs: number = TTL_MS): string {
  const normalized = normalizeEmail(email);
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  store.set(normalized, { code, expiresAt: Date.now() + ttlMs });
  return code;
}

export function getVerificationEntry(email: string): VerificationEntry | undefined {
  const normalized = normalizeEmail(email);
  const entry = store.get(normalized);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(normalized);
    return undefined;
  }
  return entry;
}

export function clearVerificationCode(email: string): void {
  store.delete(normalizeEmail(email));
}

export function verifyCode(email: string, code: string): boolean {
  const entry = getVerificationEntry(email);
  if (!entry) return false;
  const isValid = entry.code === code.trim();
  if (isValid) {
    clearVerificationCode(email);
  }
  return isValid;
}

export function hasActiveCode(email: string): boolean {
  return Boolean(getVerificationEntry(email));
}
