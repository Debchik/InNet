import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'node:crypto';
import { markPaymentStatus, getPayment } from '../../../lib/payments/store';
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin';
import type { UserAccount } from '../../../lib/storage';
import { normalizePlanProduct, type PlanProduct } from '../../../lib/plans';

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

type PersistedUser = Omit<UserAccount, 'password'>;

const TABLE_NAME = 'user_accounts';
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MAX_BODY_SIZE = 1 * 1024 * 1024; // 1mb

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalLength = 0;

  for await (const chunk of req) {
    const bufferChunk = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
    totalLength += bufferChunk.length;
    if (totalLength > MAX_BODY_SIZE) {
      throw new Error('Webhook payload exceeds allowed size');
    }
    chunks.push(bufferChunk);
  }

  return Buffer.concat(chunks);
}

function verifyBasicAuth(req: NextApiRequest): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Basic ')) return false;
  const expectedShopId = process.env.YOOKASSA_SHOP_ID;
  const expectedSecret = process.env.YOOKASSA_SECRET_KEY;
  if (!expectedShopId || !expectedSecret) return false;
  const expected = Buffer.from(`${expectedShopId}:${expectedSecret}`).toString('base64');
  return authHeader.slice('Basic '.length) === expected;
}

function verifyContentHmac(req: NextApiRequest, rawBody: Buffer): boolean {
  const secret = process.env.YOOKASSA_SECRET_KEY;
  if (!secret) return false;
  const header = req.headers['content-hmac'];
  if (!header) return false;

  const headerValues = Array.isArray(header) ? header : [header];
  const expectedDigest = crypto.createHmac('sha256', secret).update(rawBody).digest();

  return headerValues.some((value) => {
    const candidate = value?.toString().trim();
    if (!candidate) return false;
    const normalized = candidate.includes('=') ? candidate.split('=').pop() ?? '' : candidate;
    try {
      const providedDigest = Buffer.from(normalized, 'base64');
      if (providedDigest.length !== expectedDigest.length) {
        return false;
      }
      return crypto.timingSafeEqual(providedDigest, expectedDigest);
    } catch {
      return false;
    }
  });
}

async function applySuccessfulPaymentUpdate(params: {
  userId: string;
  planProduct: PlanProduct;
  paymentId: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  const client = getSupabaseAdminClient();
  if (!client) {
    console.warn('[yookassa] Supabase client unavailable, skipping remote subscription sync');
    return;
  }

  const { userId, planProduct, metadata, paymentId } = params;

  try {
    const { data, error } = await client
      .from(TABLE_NAME)
      .select('data')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('[yookassa] Failed to load user account for payment', { userId, paymentId, error });
      return;
    }

    const rawUser = data?.data as PersistedUser | null | undefined;
    if (!rawUser) {
      console.warn('[yookassa] User data missing in Supabase, cannot apply subscription', { userId, paymentId });
      return;
    }

    const activatedAt = Date.now();
    const trialDaysRaw = metadata?.trialDays;
    const parsedTrialDays = trialDaysRaw ? Number.parseInt(trialDaysRaw, 10) : Number.NaN;
    const hasTrial = Number.isFinite(parsedTrialDays) && parsedTrialDays > 0;
    const expiresAt = hasTrial ? activatedAt + parsedTrialDays * DAY_IN_MS : null;

    const updatedUser: PersistedUser = {
      ...rawUser,
      plan: 'pro',
      planActivatedAt: activatedAt,
      planProduct,
      planExpiresAt: expiresAt,
    };

    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      plan: 'pro',
      plan_activated_at: new Date(activatedAt).toISOString(),
      data: updatedUser,
      updated_at: nowIso,
    };

    const { error: updateError } = await client
      .from(TABLE_NAME)
      .update(updatePayload)
      .eq('id', userId);

    if (updateError) {
      console.error('[yookassa] Failed to update subscription state after payment', {
        userId,
        paymentId,
        error: updateError,
      });
    }
  } catch (error) {
    console.error('[yookassa] Unexpected error while syncing subscription', {
      userId,
      paymentId,
      error,
    });
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WebhookResponse | WebhookError>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Метод не поддерживается' });
  }

  let rawBody: Buffer;
  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    console.error('[yookassa] Failed to read webhook body', error);
    return res.status(413).json({ ok: false, message: 'Слишком большой payload вебхука' });
  }

  const isAuthorized = verifyBasicAuth(req) || verifyContentHmac(req, rawBody);
  if (!isAuthorized) {
    return res.status(401).json({ ok: false, message: 'Некорректная авторизация вебхука' });
  }

  let payload: YookassaWebhook;
  try {
    const text = rawBody.toString('utf8') || '{}';
    payload = JSON.parse(text) as YookassaWebhook;
  } catch (error) {
    console.error('[yookassa] Failed to parse webhook payload', error);
    return res.status(400).json({ ok: false, message: 'Невалидный JSON вебхука' });
  }

  if (payload === null || typeof payload !== 'object') {
    return res.status(400).json({ ok: false, message: 'Неверный формат вебхука' });
  }

  const paymentId = payload?.object?.id;

  if (!paymentId) {
    return res.status(400).json({ ok: false, message: 'Отсутствует идентификатор платежа' });
  }

  const storedEntry = getPayment(paymentId);
  const metadata = payload.object?.metadata ?? {};
  const metadataPlan = normalizePlanProduct(metadata.planId);
  const resolvedPlanProduct = metadataPlan ?? storedEntry?.planType ?? null;
  const resolvedUserId = metadata.userId ?? storedEntry?.userId ?? null;

  if (payload.event === 'payment.succeeded') {
    markPaymentStatus(paymentId, 'succeeded');
    console.info('[yookassa] payment succeeded', paymentId, metadata);
    if (resolvedUserId && resolvedPlanProduct) {
      await applySuccessfulPaymentUpdate({
        userId: resolvedUserId,
        planProduct: resolvedPlanProduct,
        paymentId,
        metadata,
      });
    } else {
      console.warn('[yookassa] Missing user or plan metadata for payment', {
        paymentId,
        metadata,
        storedEntry,
      });
    }
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
    bodyParser: false,
  },
};
