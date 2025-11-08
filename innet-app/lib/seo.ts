const FALLBACK_SITE_URL = 'https://innet-lac.vercel.app';

const sanitizeUrl = (value?: string) => {
  if (!value) return FALLBACK_SITE_URL;
  // Remove trailing slash for consistent concatenation later.
  return value.replace(/\/+$/, '');
};

const siteUrl = sanitizeUrl(process.env.NEXT_PUBLIC_SITE_URL);

export const seoConfig = {
  siteName: 'InNet',
  defaultTitle: 'InNet — цифровая визитка, QR и умный нетворкинг',
  defaultDescription:
    'InNet помогает быстро обмениваться контактами, создавать персональные QR-коды и выстраивать сеть знакомств с напоминаниями о важных касаниях.',
  defaultKeywords: [
    'InNet',
    'цифровая визитка',
    'QR визитка',
    'сетевой маркетинг',
    'нетворкинг',
    'менеджер контактов',
    'умные напоминания',
  ],
  defaultOgImage: `${siteUrl}/landing.png`,
  siteUrl,
  locale: 'ru_RU',
};

export const buildCanonicalUrl = (path?: string) => {
  if (!path) return siteUrl;
  if (path.startsWith('http')) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${siteUrl}${normalizedPath}`;
};
