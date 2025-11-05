import type { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcrypt';
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin';
import type { UserAccount } from '../../../lib/storage';
import { DEFAULT_PLAN } from '../../../lib/plans';
import { normalizePhone } from '../../../utils/contact';

type RegisterRequest = {
  user?: UserAccount;
  password?: string;
};

type RegisterSuccess = {
  ok: true;
  user: Omit<UserAccount, 'password'>;
};

type RegisterError = {
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
  res: NextApiResponse<RegisterSuccess | RegisterError>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Метод не поддерживается' });
  }

  const body = req.body as RegisterRequest;
  const user = body.user;
  const password = body.password;

  if (!user || typeof user !== 'object') {
    return res.status(400).json({ ok: false, message: 'Отсутствует описание пользователя.' });
  }

  if (typeof password !== 'string' || password.length < 6) {
    return res
      .status(400)
      .json({ ok: false, message: 'Пароль должен состоять как минимум из 6 символов.' });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return res
      .status(500)
      .json({ ok: false, message: 'Supabase не настроен. Укажите ключ сервисной роли.' });
  }

  const normalizedEmail = (user.email ?? '').trim().toLowerCase();
  if (!normalizedEmail) {
    return res.status(400).json({ ok: false, message: 'Необходимо указать корректный email.' });
  }

  const normalizedPhoneRaw = user.phone ? normalizePhone(user.phone) : '';
  const normalizedPhone = normalizedPhoneRaw || undefined;
  const supabaseUid = user.supabaseUid?.trim() || null;
  const plan = user.plan ?? DEFAULT_PLAN;
  const planActivatedAt = user.planActivatedAt ?? Date.now();

  try {
    const { data: existing, error: selectError } = await client
      .from(TABLE_NAME)
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (selectError) {
      console.error('[api/account/register] Failed to check existing user', selectError);
      return res
        .status(500)
        .json({ ok: false, message: 'Не удалось проверить существование пользователя.' });
    }

    if (existing) {
      return res.status(409).json({
        ok: false,
        message: 'Аккаунт с таким email уже существует. Попробуйте войти.',
      });
    }

    if (normalizedPhone) {
      const { data: existingByPhone, error: phoneSelectError } = await client
        .from(TABLE_NAME)
        .select('id')
        .eq('phone', normalizedPhone)
        .maybeSingle();
      if (phoneSelectError) {
        console.error('[api/account/register] Failed to check existing phone', phoneSelectError);
        return res
          .status(500)
          .json({ ok: false, message: 'Не удалось проверить телефон пользователя.' });
      }
      if (existingByPhone) {
        return res.status(409).json({
          ok: false,
          message: 'Аккаунт с таким телефоном уже существует. Попробуйте войти.',
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const sanitizedUser = sanitizeUser({
      ...user,
      email: normalizedEmail,
      phone: normalizedPhone,
      plan,
      planActivatedAt,
      supabaseUid,
    });

    const now = new Date().toISOString();

    const { error: insertError } = await client.from(TABLE_NAME).insert({
      id: user.id,
      email: normalizedEmail,
      phone: normalizedPhone ?? null,
      supabase_uid: supabaseUid,
      password_hash: passwordHash,
      plan,
      plan_activated_at: new Date(planActivatedAt).toISOString(),
      data: sanitizedUser,
      created_at: now,
      updated_at: now,
    });

    if (insertError) {
      console.error('[api/account/register] Failed to insert user account', insertError);
      return res
        .status(500)
        .json({ ok: false, message: 'Не удалось сохранить аккаунт в Supabase.' });
    }

    return res.status(201).json({ ok: true, user: sanitizedUser });
  } catch (error) {
    console.error('[api/account/register] Unexpected failure', error);
    return res
      .status(500)
      .json({ ok: false, message: 'Произошла непредвиденная ошибка при создании аккаунта.' });
  }
}
