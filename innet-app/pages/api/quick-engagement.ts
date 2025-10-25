import type { NextApiRequest, NextApiResponse } from 'next';
import { parseShareToken } from '../../lib/share';
import { appendQuickEngagement } from '../../lib/server/quick-engagement-store';
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin';

type SuccessResponse = { ok: true };
type ErrorResponse = { ok: false; message: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Метод не поддерживается' });
  }

  const { token, mode, user, contactId, ownerId, ownerName } = req.body ?? {};

  if (typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ ok: false, message: 'Отсутствует токен обмена.' });
  }

  if (mode !== 'existing' && mode !== 'quick-signup') {
    return res.status(400).json({ ok: false, message: 'Неверный режим сохранения контакта.' });
  }

  let parsed;
  try {
    parsed = parseShareToken(token.trim());
  } catch {
    return res.status(400).json({ ok: false, message: 'Некорректный токен обмена.' });
  }

  const receiverEmail =
    typeof user?.email === 'string' && user.email.trim() ? user.email.trim().toLowerCase() : undefined;
  const receiverName =
    typeof user?.name === 'string' && user.name.trim() ? user.name.trim() : undefined;
  const normalizedContactId =
    typeof contactId === 'string' && contactId.trim() ? contactId.trim() : null;

  const shareOwnerId =
    typeof ownerId === 'string' && ownerId.trim() ? ownerId.trim() : parsed.owner?.id ?? null;
  const shareOwnerName =
    typeof ownerName === 'string' && ownerName.trim() ? ownerName.trim() : parsed.owner?.name ?? null;

  const groupsSummary = Array.isArray(parsed.groups)
    ? parsed.groups.map((group) => ({
        id: group.id,
        name: group.name,
        facts: Array.isArray(group.facts) ? group.facts.length : 0,
      }))
    : [];

  try {
    await appendQuickEngagement({
      mode,
      contactId: normalizedContactId,
      receiver: { email: receiverEmail, name: receiverName },
      shareOwner: { id: shareOwnerId, name: shareOwnerName },
      groupsSummary,
    });
  } catch (error) {
    console.error('[api/quick-engagement] Failed to persist engagement locally', error);
    return res.status(500).json({ ok: false, message: 'Не удалось сохранить данные на сервере.' });
  }

  const client = getSupabaseAdminClient();
  if (client) {
    try {
      await client.from('share_engagements').insert({
        mode,
        contact_id: normalizedContactId,
        receiver_email: receiverEmail ?? null,
        receiver_name: receiverName ?? null,
        share_owner_id: shareOwnerId ?? null,
        share_owner_name: shareOwnerName ?? null,
        facts_count: groupsSummary.reduce((acc, group) => acc + group.facts, 0),
        groups: groupsSummary,
      });
    } catch (error) {
      console.warn('[api/quick-engagement] Supabase insert skipped', error);
    }
  }

  return res.status(200).json({ ok: true });
}
