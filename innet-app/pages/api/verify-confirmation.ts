import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCode, hasActiveCode } from '../../lib/server/verification-store';

type ResponseData =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'expired' | 'unknown'; message: string };

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      ok: false,
      reason: 'unknown',
      message: 'Метод не поддерживается',
    });
  }

  const { email, code } = req.body ?? {};
  if (typeof email !== 'string' || typeof code !== 'string') {
    return res.status(400).json({
      ok: false,
      reason: 'unknown',
      message: 'Укажите email и код',
    });
  }

  const hasCode = hasActiveCode(email);
  if (!hasCode) {
    return res.status(400).json({
      ok: false,
      reason: 'expired',
      message: 'Код не найден или истёк. Запросите новый.',
    });
  }

  const isValid = verifyCode(email, code);
  if (!isValid) {
    return res.status(400).json({
      ok: false,
      reason: 'invalid',
      message: 'Неверный код. Проверьте письмо и попробуйте снова.',
    });
  }

  return res.status(200).json({ ok: true });
}
