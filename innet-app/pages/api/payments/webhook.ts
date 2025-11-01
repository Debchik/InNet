import type { NextApiRequest, NextApiResponse } from 'next';
import { markPaymentStatus, getPayment } from '../../../lib/payments/store';

type YookassaWebhook = {
  event?: string;
  object?: {
    id?: string;
    status?: string;
    metadata?: Record<string, string>;
  };
};

type WebhookResponse = { ok: true };
type WebhookError = { ok: false; message: string };

function verifyBasicAuth(req: NextApiRequest): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Basic ')) return false;
  const expectedShopId = process.env.YOOKASSA_SHOP_ID;
  const expectedSecret = process.env.YOOKASSA_SECRET_KEY;
  if (!expectedShopId || !expectedSecret) return false;
  const expected = Buffer.from(`${expectedShopId}:${expectedSecret}`).toString('base64');
  return authHeader.slice('Basic '.length) === expected;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WebhookResponse | WebhookError>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Метод не поддерживается' });
  }

  if (!verifyBasicAuth(req)) {
    return res.status(401).json({ ok: false, message: 'Некорректная авторизация вебхука' });
  }

  const payload = req.body as YookassaWebhook;
  const paymentId = payload?.object?.id;

  if (!paymentId) {
    return res.status(400).json({ ok: false, message: 'Отсутствует идентификатор платежа' });
  }

  if (payload.event === 'payment.succeeded') {
    markPaymentStatus(paymentId, 'succeeded');
    console.info('[yookassa] payment succeeded', paymentId, payload.object?.metadata ?? {});
  } else if (payload.event === 'payment.canceled') {
    markPaymentStatus(paymentId, 'canceled');
    console.info('[yookassa] payment canceled', paymentId);
  } else {
    console.info('[yookassa] received event', payload.event);
  }

  const entry = getPayment(paymentId);
  if (!entry) {
    console.warn('[yookassa] payment not found in store', paymentId);
  }

  return res.status(200).json({ ok: true });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};
