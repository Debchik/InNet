import crypto from 'node:crypto';

type Currency = 'RUB';

type Amount = {
  value: string;
  currency: Currency;
};

type CreatePaymentParams = {
  amount: number;
  currency?: Currency;
  description: string;
  returnUrl: string;
  userId: string;
  email?: string;
  metadata?: Record<string, string>;
};

type YookassaConfirmation =
  | { type: 'redirect'; confirmation_url: string }
  | { type: string; [key: string]: unknown };

export type YookassaPayment = {
  id: string;
  status: string;
  amount: Amount;
  description?: string;
  confirmation?: YookassaConfirmation;
  metadata?: Record<string, string>;
  created_at?: string;
  paid?: boolean;
  test?: boolean;
};

function toMinorAmount(amount: number): string {
  return amount.toFixed(2);
}

function getCredentials(): { shopId: string; secretKey: string } {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    throw new Error('YOOKASSA_SHOP_ID или YOOKASSA_SECRET_KEY не заданы в окружении.');
  }
  return { shopId, secretKey };
}

export async function createPayment({
  amount,
  currency = 'RUB',
  description,
  returnUrl,
  userId,
  email,
  metadata,
}: CreatePaymentParams): Promise<YookassaPayment> {
  const { shopId, secretKey } = getCredentials();
  const idempotenceKey = crypto.randomUUID();
  const body: Record<string, unknown> = {
    amount: {
      value: toMinorAmount(amount),
      currency,
    },
    capture: true,
    description,
    confirmation: {
      type: 'redirect',
      return_url: returnUrl,
    },
    metadata: {
      ...(metadata ?? {}),
      userId,
    },
  };

  if (email) {
    body.receipt = {
      customer: { email },
      items: [
        {
          description,
          amount: {
            value: toMinorAmount(amount),
            currency,
          },
          quantity: 1,
          vat_code: 1,
        },
      ],
    };
  }

  const response = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`,
      'Idempotence-Key': idempotenceKey,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as YookassaPayment & { type?: string; title?: string; detail?: string };

  if (!response.ok) {
    const message =
      payload?.type === 'error'
        ? `${payload.title ?? 'Ошибка ЮKassa'}: ${payload.detail ?? 'Неизвестная ошибка'}`
        : `Не удалось создать платёж: статус ${response.status}`;
    throw new Error(message);
  }

  return payload;
}
