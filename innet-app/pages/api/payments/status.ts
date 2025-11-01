import type { NextApiRequest, NextApiResponse } from 'next';
import { getPayment, PlanProduct } from '../../../lib/payments/store';

type SuccessResponse = {
  ok: true;
  status: 'pending' | 'succeeded' | 'canceled' | 'unknown';
  userId?: string;
  planId?: PlanProduct;
};

type ErrorResponse = {
  ok: false;
  message: string;
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, message: 'Метод не поддерживается' });
  }

  const paymentId = typeof req.query.paymentId === 'string' ? req.query.paymentId.trim() : '';
  if (!paymentId) {
    return res.status(400).json({ ok: false, message: 'Не указан paymentId' });
  }

  const entry = getPayment(paymentId);
  if (!entry) {
  return res.status(200).json({ ok: true, status: 'unknown' });
  }

  return res.status(200).json({
    ok: true,
    status: entry.status,
    userId: entry.userId,
    planId: entry.planType,
  });
}
