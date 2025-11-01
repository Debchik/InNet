type PaymentStatus = 'pending' | 'succeeded' | 'canceled';

export type PlanProduct = 'pro-monthly' | 'pro-annual';

type StoredPayment = {
  paymentId: string;
  userId: string;
  planType: PlanProduct;
  status: PaymentStatus;
  createdAt: number;
};

const payments = new Map<string, StoredPayment>();

export function rememberPayment(paymentId: string, userId: string, planType: PlanProduct) {
  payments.set(paymentId, {
    paymentId,
    userId,
    planType,
    status: 'pending',
    createdAt: Date.now(),
  });
}

export function markPaymentStatus(paymentId: string, status: PaymentStatus) {
  const entry = payments.get(paymentId);
  if (!entry) return;
  entry.status = status;
  payments.set(paymentId, entry);
}

export function getPayment(paymentId: string): StoredPayment | undefined {
  return payments.get(paymentId);
}

export function consumePayment(paymentId: string): StoredPayment | undefined {
  const entry = payments.get(paymentId);
  if (!entry) return undefined;
  payments.delete(paymentId);
  return entry;
}
