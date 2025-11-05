import type { PlanProduct } from '../plans';

type CreatePaymentSuccess = {
  ok: true;
  paymentId: string;
  confirmationUrl: string;
  planId: PlanProduct;
};

type CreatePaymentError = {
  ok: false;
  message: string;
};

type PaymentStatus = 'pending' | 'succeeded' | 'canceled' | 'unknown';

type PaymentStatusSuccess = {
  ok: true;
  status: PaymentStatus;
  userId?: string;
  planId?: PlanProduct;
};

type PaymentStatusError = {
  ok: false;
  message: string;
};

export type StartPaymentParams = {
  planId: PlanProduct;
  userId: string;
  email?: string;
  returnUrl?: string;
};

export async function startPayment(params: StartPaymentParams): Promise<CreatePaymentSuccess> {
  const response = await fetch('/api/payments/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const payload = (await response.json().catch(() => null)) as
    | CreatePaymentSuccess
    | CreatePaymentError
    | null;

  if (!payload) {
    throw new Error('Сервер вернул пустой ответ. Попробуйте позже.');
  }

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? 'Не удалось создать платёж. Попробуйте позже.' : payload.message);
  }

  return payload;
}

export async function getPaymentStatus(paymentId: string): Promise<PaymentStatusSuccess> {
  const response = await fetch(`/api/payments/status?paymentId=${encodeURIComponent(paymentId)}`);

  const payload = (await response.json().catch(() => null)) as
    | PaymentStatusSuccess
    | PaymentStatusError
    | null;

  if (!payload) {
    throw new Error('Сервер вернул пустой ответ при проверке платежа.');
  }

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? 'Не удалось получить статус платежа.' : payload.message);
  }

  return payload;
}

export type { PaymentStatus };
