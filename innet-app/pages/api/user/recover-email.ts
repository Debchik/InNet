import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin';

type RecoverResponse =
  | { ok: true; email: string | null }
  | { ok: false; message: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RecoverResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Метод не поддерживается' });
  }

  const { supabaseUid } = req.body ?? {};
  if (typeof supabaseUid !== 'string' || !supabaseUid.trim()) {
    return res
      .status(400)
      .json({ ok: false, message: 'Укажите корректный идентификатор пользователя Supabase.' });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return res.status(200).json({ ok: true, email: null });
  }

  try {
    const { data, error } = await client.auth.admin.getUserById(supabaseUid.trim());
    if (error) {
      console.warn('[api/user/recover-email] Failed to read Supabase user', error);
      return res.status(200).json({ ok: true, email: null });
    }

    const email = data.user?.email?.trim().toLowerCase() ?? null;
    return res.status(200).json({ ok: true, email });
  } catch (error) {
    console.error('[api/user/recover-email] Unexpected error', error);
    return res.status(500).json({
      ok: false,
      message: 'Не удалось получить данные Supabase. Проверьте журналы сервера.',
    });
  }
}
