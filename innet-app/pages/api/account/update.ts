import type { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcrypt';
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin';
import type { UserAccount } from '../../../lib/storage';
import { DEFAULT_PLAN } from '../../../lib/plans';
import { normalizePhone } from '../../../utils/contact';

type UpdateRequest = {
  user?: UserAccount;
  password?: string | null;
};

type UpdateSuccess = {
  ok: true;
};

type UpdateError = {
  ok: false;
  message: string;
};

const TABLE_NAME = 'user_accounts';

function sanitizeUser(user: UserAccount): Omit<UserAccount, 'password'> {
  const { password: _password, ...rest } = user;
  void _password;
  return rest;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdateSuccess | UpdateError>
) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ ok: false, message: 'Метод не поддерживается' });
  }

  const { user, password } = req.body as UpdateRequest;
  if (!user || typeof user !== 'object') {
    return res.status(400).json({ ok: false, message: 'Отсутствуют данные пользователя.' });
  }

  const normalizedEmail = (user.email ?? '').trim().toLowerCase();
  if (!normalizedEmail) {
    return res.status(400).json({ ok: false, message: 'Необходимо указать email пользователя.' });
  }

  if (!user.id) {
    return res.status(400).json({ ok: false, message: 'Отсутствует идентификатор пользователя.' });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return res
      .status(500)
      .json({ ok: false, message: 'Supabase не настроен. Обратитесь к администратору.' });
  }

  try {
    let passwordHash: string | undefined;
    if (typeof password === 'string' && password.length >= 6) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const normalizedPhoneRaw = user.phone ? normalizePhone(user.phone) : '';
    const normalizedPhone = normalizedPhoneRaw || undefined;
    const supabaseUid = user.supabaseUid?.trim() || null;
    const plan = user.plan ?? DEFAULT_PLAN;
    const planActivatedAt = user.planActivatedAt ?? Date.now();
    const planProduct = user.planProduct ?? null;
    const planExpiresAt = user.planExpiresAt ?? null;

    const sanitizedUser = sanitizeUser({
      ...user,
      email: normalizedEmail,
      phone: normalizedPhone,
      plan,
      planActivatedAt,
      supabaseUid,
      planProduct,
      planExpiresAt,
    });
    const now = new Date().toISOString();

    const { error } = await client
      .from(TABLE_NAME)
      .update({
        email: normalizedEmail,
        phone: normalizedPhone ?? null,
        supabase_uid: supabaseUid,
        plan,
        plan_activated_at: new Date(planActivatedAt).toISOString(),
        ...(passwordHash ? { password_hash: passwordHash } : {}),
        data: sanitizedUser,
        updated_at: now,
      })
      .eq('id', user.id);

    if (error) {
      console.error('[api/account/update] Failed to update user account', error);
      return res
        .status(500)
        .json({ ok: false, message: 'Не удалось обновить данные пользователя в Supabase.' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[api/account/update] Unexpected failure', error);
    return res.status(500).json({
      ok: false,
      message: 'Произошла непредвиденная ошибка при обновлении аккаунта.',
    });
  }
}
