import type { NextApiRequest, NextApiResponse } from 'next';
import { createPayment } from '../../../lib/payments/yookassa';
import { rememberPayment } from '../../../lib/payments/store';

type CreatePaymentBody = {
  amount?: number;
  description?: string;
  returnUrl?: string;
  userId?: string;
  email?: string;
};

type SuccessResponse = {
  ok: true;
  paymentId: string;
  confirmationUrl: string;
};

type ErrorResponse = {
  ok: false;
  message: string;
};

const DEFAULT_AMOUNT = 199;
const DEFAULT_DESCRIPTION = 'Подписка InNet Pro';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Метод не поддерживается' });
  }

  const body = (req.body ?? {}) as CreatePaymentBody;
  const userId = body.userId?.trim();
  if (!userId) {
    return res.status(400).json({ ok: false, message: 'Не указан идентификатор пользователя' });
  }

  const amount = typeof body.amount === 'number' && body.amount > 0 ? body.amount : DEFAULT_AMOUNT;
  const description = body.description?.trim() || DEFAULT_DESCRIPTION;
  const returnUrl =
    body.returnUrl?.trim() ||
    `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/app/qr?purchase=success`;

  try {
    const payment = await createPayment({
      amount,
      description,
      returnUrl,
      userId,
      email: body.email,
      metadata: {
        planId: 'pro',
      },
    });

    if (!payment?.id || payment?.confirmation?.type !== 'redirect') {
      throw new Error('ЮKassa вернула неожиданный ответ.');
    }

    rememberPayment(payment.id, userId, 'pro');

    return res.status(200).json({
      ok: true,
      paymentId: payment.id,
      confirmationUrl: (payment.confirmation as { confirmation_url: string }).confirmation_url,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Не удалось создать платёж. Попробуйте позже.';
    return res.status(500).json({ ok: false, message });
  }
}
