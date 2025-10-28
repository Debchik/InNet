import type { FactGroup } from './storage';

type RemoteFactsSuccess = {
  ok: true;
  groups: FactGroup[];
  syncEnabled: boolean;
  updatedAt?: string;
};

type RemoteFactsError = {
  ok: false;
  message: string;
};

export type RemoteFactsResponse = RemoteFactsSuccess | RemoteFactsError;

const FACTS_ENDPOINT = '/api/facts';

export async function fetchRemoteFacts(profileId: string): Promise<RemoteFactsResponse> {
  if (!profileId) {
    return { ok: false, message: 'Отсутствует идентификатор профиля для загрузки фактов.' };
  }

  try {
    const response = await fetch(`${FACTS_ENDPOINT}?profileId=${encodeURIComponent(profileId)}`, {
      method: 'GET',
    });
    const payload = (await response.json()) as RemoteFactsResponse;
    if (!response.ok || !payload.ok) {
      return {
        ok: false,
        message:
          ('message' in payload && payload.message) ||
          'Не удалось загрузить факты из облака.',
      };
    }
    return payload;
  } catch (error) {
    console.error('[factsRemote] fetchRemoteFacts failed', error);
    return { ok: false, message: 'Не удалось связаться с сервером синхронизации.' };
  }
}

export async function upsertRemoteFacts(
  profileId: string,
  groups: FactGroup[],
  syncEnabled: boolean
): Promise<RemoteFactsResponse> {
  if (!profileId) {
    return { ok: false, message: 'Отсутствует идентификатор профиля для синхронизации.' };
  }

  try {
    const response = await fetch(FACTS_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, groups, syncEnabled }),
    });
    const payload = (await response.json()) as RemoteFactsResponse;
    if (!response.ok || !payload.ok) {
      return {
        ok: false,
        message:
          ('message' in payload && payload.message) ||
          'Не удалось сохранить факты в Supabase.',
      };
    }
    return payload;
  } catch (error) {
    console.error('[factsRemote] upsertRemoteFacts failed', error);
    return { ok: false, message: 'Ошибка сети при попытке синхронизации фактов.' };
  }
}
