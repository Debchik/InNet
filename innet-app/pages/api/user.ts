import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin';

type UpsertPayload = {
  email: string;
  name?: string;
  surname?: string;
  phone?: string;
  telegram?: string;
  instagram?: string;
};

type SuccessResponse = {
  ok: true;
  synced: boolean;
};

type ErrorResponse = {
  ok: false;
  message: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Метод не поддерживается' });
  }

  const { email, name, surname, phone, telegram, instagram } = req.body as UpsertPayload;
  if (typeof email !== 'string' || !email.trim()) {
    return res
      .status(400)
      .json({ ok: false, message: 'Необходимо указать корректный email для синхронизации' });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    // Без настроенного Supabase просто подтверждаем запрос, чтобы фронт не ломался.
    return res.status(200).json({ ok: true, synced: false });
  }

  const payload = {
    email: email.trim().toLowerCase(),
    name: name?.trim() ?? null,
    surname: surname?.trim() ?? null,
    phone: phone?.trim() ?? null,
    telegram: telegram?.trim() ?? null,
    instagram: instagram?.trim() ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client.from('profiles').upsert(payload, {
    onConflict: 'email',
  });

  if (error) {
    console.error('[api/user] Failed to upsert profile', error);
    return res.status(500).json({
      ok: false,
      message: 'Не удалось сохранить профиль в Supabase. Проверьте логи сервера.',
    });
  }

  return res.status(200).json({ ok: true, synced: true });
}
