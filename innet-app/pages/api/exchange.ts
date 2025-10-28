import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin';
import type { SharePayload } from '../../lib/share';
import { normalizeSharePayload } from '../../lib/share';

type PostBody = {
  initiatorId?: string;
  targetId?: string;
  payload?: SharePayload;
};

type PostSuccess = {
  ok: true;
};

type GetSuccess = {
  ok: true;
  exchanges: {
    id: string;
    initiatorId: string;
    createdAt: string;
    payload: SharePayload;
  }[];
};

type ErrorResponse = {
  ok: false;
  message: string;
};

type ApiResponse = PostSuccess | GetSuccess | ErrorResponse;

const EXCHANGE_TABLE = 'fact_exchanges';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, message: 'Метод не поддерживается.' });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, exchanges: [] });
    }
    return res.status(200).json({
      ok: false,
      message: 'Supabase не настроен. Укажите ключ сервисного пользователя для обмена.',
    });
  }

  if (req.method === 'POST') {
    const { initiatorId, targetId, payload } = req.body as PostBody;

    if (!initiatorId || !targetId || !payload) {
      return res
        .status(400)
        .json({ ok: false, message: 'Необходимо передать инициатора, получателя и данные обмена.' });
    }

    const trimmedInitiator = initiatorId.trim();
    const trimmedTarget = targetId.trim();

    if (!trimmedInitiator || !trimmedTarget) {
      return res
        .status(400)
        .json({ ok: false, message: 'Переданы пустые идентификаторы для обмена.' });
    }

    if (trimmedInitiator === trimmedTarget) {
      return res.status(200).json({ ok: true });
    }

    const sanitizedPayload = normalizeSharePayload(payload);

    const { error } = await client.from(EXCHANGE_TABLE).insert({
      initiator_profile_id: trimmedInitiator,
      target_profile_id: trimmedTarget,
      payload: sanitizedPayload,
      status: 'pending',
    });

    if (error) {
      console.error('[api/exchange] Failed to insert exchange', error);
      return res
        .status(500)
        .json({ ok: false, message: 'Не удалось сохранить обмен в Supabase.' });
    }

    return res.status(200).json({ ok: true });
  }

  const rawProfileId = req.query.profileId;

  if (!rawProfileId || (Array.isArray(rawProfileId) && rawProfileId.length === 0)) {
    return res
      .status(400)
      .json({ ok: false, message: 'Не передан идентификатор профиля для получения обмена.' });
  }

  const profileId = Array.isArray(rawProfileId) ? rawProfileId[0] : rawProfileId;
  const trimmedProfileId = profileId.trim();

  if (!trimmedProfileId) {
    return res
      .status(400)
      .json({ ok: false, message: 'Пустой идентификатор профиля.' });
  }

  const { data, error } = await client
    .from(EXCHANGE_TABLE)
    .select('id,payload,initiator_profile_id,created_at')
    .eq('target_profile_id', trimmedProfileId)
    .is('consumed_at', null)
    .order('created_at', { ascending: true })
    .limit(5);

  if (error) {
    console.error('[api/exchange] Failed to load pending exchanges', error);
    return res
      .status(500)
      .json({ ok: false, message: 'Не удалось получить обмены из Supabase.' });
  }

  if (!data || data.length === 0) {
    return res.status(200).json({ ok: true, exchanges: [] });
  }

  const ids = data.map((item) => item.id);
  const exchanges = data.map((item) => ({
    id: item.id,
    initiatorId: item.initiator_profile_id,
    createdAt: item.created_at,
    payload: normalizeSharePayload(item.payload as SharePayload),
  }));

  const { error: updateError } = await client
    .from(EXCHANGE_TABLE)
    .update({
      consumed_at: new Date().toISOString(),
      status: 'delivered',
    })
    .in('id', ids);

  if (updateError) {
    console.error('[api/exchange] Failed to mark exchanges as delivered', updateError);
  }

  return res.status(200).json({ ok: true, exchanges });
}
