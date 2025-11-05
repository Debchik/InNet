import type { NextApiRequest, NextApiResponse } from 'next';
import { createPayment } from '../../../lib/payments/yookassa';
import { rememberPayment } from '../../../lib/payments/store';
import { normalizePlanProduct, type PlanProduct } from '../../../lib/plans';

type CreatePaymentBody = {
  returnUrl?: string;
  userId?: string;
  email?: string;
  planId?: string;
};

type SuccessResponse = {
  ok: true;
  paymentId: string;
  confirmationUrl: string;
  planId: PlanProduct;
};

type ErrorResponse = {
  ok: false;
  message: string;
};

const PLAN_CATALOG: Record<PlanProduct, { amount: number; description: string }> = {
  'pro-monthly': {
    amount: 299,
    description: 'Подписка InNet Pro — месяц',
  },
  'pro-annual': {
    amount: 1990,
    description: 'Подписка InNet Pro — год',
  },
};

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

  const normalizedRequestedPlan = normalizePlanProduct(body.planId as string | undefined) ?? 'pro-monthly';
  const plan = PLAN_CATALOG[normalizedRequestedPlan] ?? PLAN_CATALOG['pro-monthly'];
  const planId: PlanProduct = PLAN_CATALOG[normalizedRequestedPlan] ? normalizedRequestedPlan : 'pro-monthly';

  const returnUrl =
    body.returnUrl?.trim() ||
    `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/app/qr?purchase=success`;

  try {
    const payment = await createPayment({
      amount: plan.amount,
      description: plan.description,
      returnUrl,
      userId,
      email: body.email,
      metadata: {
        planId,
        trialDays: planId === 'pro-monthly' ? '30' : '0',
      },
    });

    if (!payment?.id || payment?.confirmation?.type !== 'redirect') {
      throw new Error('ЮKassa вернула неожиданный ответ.');
    }

    rememberPayment(payment.id, userId, planId);

    return res.status(200).json({
      ok: true,
      paymentId: payment.id,
      confirmationUrl: (payment.confirmation as { confirmation_url: string }).confirmation_url,
      planId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Не удалось создать платёж. Попробуйте позже.';
    return res.status(500).json({ ok: false, message });
  }
}
