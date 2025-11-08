import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'node:crypto';
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin';
import { SHARE_PREFIX } from '../../lib/share';

type PostResponse =
  | { ok: true; slug: string; expiresAt: string }
  | { ok: false; message: string };

type GetResponse =
  | { ok: true; token: string; expiresAt: string | null }
  | { ok: false; message: string };

const TABLE = 'share_links';
const SLUG_LENGTH = 9;
const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const SLUG_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostResponse | GetResponse>
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, message: 'Метод не поддерживается.' });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return res.status(200).json({
      ok: false,
      message:
        'Supabase не настроен. Укажите ключ сервисного пользователя, чтобы активировать короткие QR-ссылки.',
    });
  }

  if (req.method === 'POST') {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token || !token.startsWith(SHARE_PREFIX)) {
      return res
        .status(400)
        .json({ ok: false, message: 'Некорректный токен для короткой ссылки.' });
    }

    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

    const { data: existing, error: lookupError } = await client
      .from(TABLE)
      .select('slug, expires_at')
      .eq('token', token)
      .gt('expires_at', nowIso)
      .maybeSingle();

    if (lookupError && lookupError.code !== 'PGRST116') {
      console.error('[api/share-link] Failed to lookup token', lookupError);
    }

    if (existing?.slug) {
      return res.status(200).json({ ok: true, slug: existing.slug, expiresAt: existing.expires_at });
    }

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const slug = generateSlug();
      const { error } = await client.from(TABLE).insert({
        slug,
        token,
        expires_at: expiresAt,
      });
      if (!error) {
        return res.status(200).json({ ok: true, slug, expiresAt });
      }
      if (error.code !== '23505' && error.code !== '409') {
        console.error('[api/share-link] Failed to insert alias', error);
        return res
          .status(500)
          .json({ ok: false, message: 'Не удалось создать короткую ссылку для QR-кода.' });
      }
    }

    return res
      .status(500)
      .json({ ok: false, message: 'Короткие ссылки временно недоступны. Попробуйте позже.' });
  }

  const rawSlug = req.query.slug;
  if (!rawSlug) {
    return res.status(400).json({ ok: false, message: 'Не передан короткий код QR.' });
  }

  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  const trimmedSlug = typeof slug === 'string' ? slug.trim() : '';
  if (!trimmedSlug) {
    return res.status(400).json({ ok: false, message: 'Пустой короткий код QR.' });
  }

  const { data, error } = await client
    .from(TABLE)
    .select('token, expires_at')
    .eq('slug', trimmedSlug)
    .maybeSingle();

  if (error) {
    console.error('[api/share-link] Failed to resolve slug', error);
    return res.status(500).json({ ok: false, message: 'Не удалось получить короткую ссылку.' });
  }

  if (!data) {
    return res.status(404).json({ ok: false, message: 'QR-код больше не действителен.' });
  }

  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return res.status(410).json({ ok: false, message: 'Срок действия QR-кода истёк.' });
  }

  return res.status(200).json({
    ok: true,
    token: data.token,
    expiresAt: data.expires_at ?? null,
  });
}

function generateSlug(length = SLUG_LENGTH): string {
  const bytes = crypto.randomBytes(length);
  const alphabetLength = SLUG_ALPHABET.length;
  let slug = '';
  for (let i = 0; i < length; i += 1) {
    const index = bytes[i] % alphabetLength;
    slug += SLUG_ALPHABET[index];
  }
  return slug;
}
