export type ShareProfile = {
  name: string;
  avatar?: string;
  phone?: string;
  telegram?: string;
  instagram?: string;
};

export const SHARE_PROFILE_STORAGE_KEYS = [
  'innet_current_user_name',
  'innet_current_user_surname',
  'innet_current_user_phone',
  'innet_current_user_telegram',
  'innet_current_user_instagram',
  'innet_current_user_avatar',
];

export function loadShareProfile(): ShareProfile {
  if (typeof window === 'undefined') {
    return { name: 'Вы' };
  }
  const name = (localStorage.getItem('innet_current_user_name') ?? '').trim();
  const surname = (localStorage.getItem('innet_current_user_surname') ?? '').trim();
  const fullName = [name, surname].filter(Boolean).join(' ').trim() || 'Вы';
  return {
    name: fullName,
    avatar: cleanValue(localStorage.getItem('innet_current_user_avatar')),
    phone: cleanValue(localStorage.getItem('innet_current_user_phone')),
    telegram: cleanHandle(localStorage.getItem('innet_current_user_telegram')),
    instagram: cleanHandle(localStorage.getItem('innet_current_user_instagram')),
  };
}

function cleanValue(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function cleanHandle(value: string | null): string | undefined {
  const cleaned = cleanValue(value);
  if (!cleaned) return undefined;
  return cleaned.startsWith('@') ? cleaned : `@${cleaned.replace(/^@+/, '')}`;
}
