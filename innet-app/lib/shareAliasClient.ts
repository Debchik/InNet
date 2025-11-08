import { buildShareAliasUrl, extractAliasSlug } from './share';

type CreateAliasResponse =
  | { ok: true; slug: string; expiresAt?: string | null }
  | { ok: false; message: string };

type ResolveAliasResponse =
  | { ok: true; token: string; expiresAt?: string | null }
  | { ok: false; message: string };

const ENDPOINT = '/api/share-link';

export async function createShareAliasLink(token: string): Promise<{
  slug: string;
  url: string;
}> {
  const slug = await requestShareAlias(token);
  return { slug, url: buildShareAliasUrl(slug) };
}

export async function resolveAliasToken(token: string): Promise<string> {
  const slug = extractAliasSlug(token);
  if (!slug) {
    return token;
  }
  return fetchAlias(slug);
}

export async function fetchAlias(slug: string): Promise<string> {
  const trimmed = slug.trim();
  if (!trimmed) {
    throw new Error('Не указан короткий код для обмена.');
  }
  const response = await fetch(`${ENDPOINT}?slug=${encodeURIComponent(trimmed)}`);
  const data = (await response.json().catch(() => ({}))) as ResolveAliasResponse;
  if (!response.ok || !data || !('ok' in data) || !data.ok || !data.token) {
    throw new Error(
      (data && 'message' in data && data.message) || 'Не удалось расшифровать короткую ссылку.'
    );
  }
  return data.token;
}

async function requestShareAlias(token: string): Promise<string> {
  if (!token) {
    throw new Error('Пустой токен QR-кода.');
  }
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = (await response.json().catch(() => ({}))) as CreateAliasResponse;
  if (!response.ok || !data || !('ok' in data) || !data.ok || !data.slug) {
    throw new Error(
      (data && 'message' in data && data.message) ||
        'Не удалось создать короткую ссылку для QR-кода.'
    );
  }
  return data.slug;
}
