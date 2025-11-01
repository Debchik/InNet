const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RAW_PHONE_PATTERN = /^\+?[0-9 ()-]{6,32}$/;

export function isEmail(value: string | null | undefined): value is string {
  if (!value) return false;
  return EMAIL_PATTERN.test(value.trim());
}

export function normalizePhone(value: string | null | undefined): string {
  if (!value) return '';
  const cleaned = value.replace(/[^\d+()\-\s]/g, '');
  const collapsed = cleaned.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  return collapsed.slice(0, 32);
}

export function isPhone(value: string | null | undefined): value is string {
  if (!value) return false;
  const normalized = normalizePhone(value);
  if (!normalized) return false;
  if (!RAW_PHONE_PATTERN.test(normalized)) return false;
  const digitCount = normalized.replace(/\D/g, '').length;
  return digitCount >= 6;
}
