import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin';
import type { FactGroup } from '../../lib/storage';
import { normalizeFactGroups } from '../../lib/storage';

type SuccessResponse = {
  ok: true;
  groups: FactGroup[];
  syncEnabled: boolean;
  updatedAt?: string;
};

type ErrorResponse = {
  ok: false;
  message: string;
};

type ApiResponse = SuccessResponse | ErrorResponse;

const FACT_TABLE = 'fact_collections';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ ok: false, message: 'Метод не поддерживается.' });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        groups: [],
        syncEnabled: false,
      });
    }
    return res.status(200).json({
      ok: false,
      message: 'Supabase не настроен. Укажите ключи окружения для синхронизации.',
    });
  }

  const rawProfileId =
    req.method === 'GET' ? req.query.profileId : (req.body?.profileId as string | undefined);

  if (!rawProfileId || (Array.isArray(rawProfileId) && rawProfileId.length === 0)) {
    return res
      .status(400)
      .json({ ok: false, message: 'Не передан идентификатор профиля для синхронизации.' });
  }

  const profileId = Array.isArray(rawProfileId) ? rawProfileId[0] : rawProfileId;
  const trimmedProfileId = profileId.trim();

  if (!trimmedProfileId) {
    return res
      .status(400)
      .json({ ok: false, message: 'Полученный идентификатор профиля пуст.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await client
      .from(FACT_TABLE)
      .select('groups,sync_enabled,updated_at')
      .eq('profile_id', trimmedProfileId)
      .maybeSingle();

    if (error) {
      console.error('[api/facts] Failed to fetch remote facts', error);
      return res
        .status(500)
        .json({ ok: false, message: 'Не удалось получить данные о фактах из Supabase.' });
    }

    if (!data) {
      return res
        .status(200)
        .json({ ok: true, groups: [], syncEnabled: false });
    }

    const groups = normalizeFactGroups(data.groups);
    return res.status(200).json({
      ok: true,
      groups,
      syncEnabled: Boolean(data.sync_enabled),
      updatedAt: data.updated_at ?? undefined,
    });
  }

  const groupsPayload = Array.isArray(req.body?.groups) ? req.body.groups : [];
  const groups = normalizeFactGroups(groupsPayload);
  const syncEnabled = Boolean(req.body?.syncEnabled);

  const record = {
    profile_id: trimmedProfileId,
    groups,
    sync_enabled: syncEnabled,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client.from(FACT_TABLE).upsert(record, {
    onConflict: 'profile_id',
  });

  if (error) {
    console.error('[api/facts] Failed to upsert fact collection', error);
    return res
      .status(500)
      .json({ ok: false, message: 'Не удалось сохранить факты в Supabase.' });
  }

  return res.status(200).json({
    ok: true,
    groups,
    syncEnabled,
    updatedAt: record.updated_at,
  });
}
