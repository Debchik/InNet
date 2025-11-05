import type { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcrypt';
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin';
import type { UserAccount } from '../../../lib/storage';
import { isEmail, normalizePhone } from '../../../utils/contact';

type LoginRequest = {
  identifier?: string;
  password?: string;
};

type LoginSuccess = {
  ok: true;
  user: Omit<UserAccount, 'password'>;
};

type LoginError = {
  ok: false;
  message: string;
};

const TABLE_NAME = 'user_accounts';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LoginSuccess | LoginError>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Метод не поддерживается' });
  }

  const { identifier, password } = req.body as LoginRequest;

  if (typeof identifier !== 'string' || !identifier.trim()) {
    return res
      .status(400)
      .json({ ok: false, message: 'Укажите email или телефон для входа.' });
  }

  if (typeof password !== 'string' || password.length < 6) {
    return res
      .status(400)
      .json({ ok: false, message: 'Укажите корректный пароль длиной не менее 6 символов.' });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return res
      .status(500)
      .json({ ok: false, message: 'Supabase не настроен. Обратитесь к администратору.' });
  }

  const trimmedIdentifier = identifier.trim();
  const normalizedEmail = isEmail(trimmedIdentifier) ? trimmedIdentifier.toLowerCase() : '';
  const normalizedPhone = normalizePhone(trimmedIdentifier);
  const useEmail = Boolean(normalizedEmail);
  const usePhone = !useEmail && Boolean(normalizedPhone);

  if (!useEmail && !usePhone) {
    return res.status(400).json({
      ok: false,
      message: 'Введите корректный email или телефон в международном формате.',
    });
  }

  try {
    const query = client.from(TABLE_NAME).select('id,password_hash,data');
    const { data, error } = useEmail
      ? await query.eq('email', normalizedEmail).maybeSingle()
      : await query.eq('phone', normalizedPhone).maybeSingle();

    if (error) {
      console.error('[api/account/login] Failed to read user account', error);
      return res
        .status(500)
        .json({ ok: false, message: 'Не удалось получить данные аккаунта из Supabase.' });
    }

    if (!data?.password_hash || !data?.data) {
      return res.status(401).json({ ok: false, message: 'Неверный email или пароль.' });
    }

    const match = await bcrypt.compare(password, data.password_hash as string);
    if (!match) {
      return res.status(401).json({ ok: false, message: 'Неверный email или пароль.' });
    }

    if (data.id) {
      const now = new Date().toISOString();
      const { error: updateError } = await client
        .from(TABLE_NAME)
        .update({ last_login_at: now, updated_at: now })
        .eq('id', data.id);
      if (updateError) {
        console.warn('[api/account/login] Failed to record last login timestamp', updateError);
      }
    }

    const remoteUser = data.data as Omit<UserAccount, 'password'>;
    return res.status(200).json({ ok: true, user: remoteUser });
  } catch (error) {
    console.error('[api/account/login] Unexpected failure', error);
    return res
      .status(500)
      .json({ ok: false, message: 'Произошла непредвиденная ошибка. Повторите попытку позже.' });
  }
}
