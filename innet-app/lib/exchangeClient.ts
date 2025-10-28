import type { SharePayload } from './share';

export type RemoteExchange = {
  id: string;
  initiatorId: string;
  createdAt: string;
  payload: SharePayload;
};

type ExchangeSuccess = {
  ok: true;
  exchanges: RemoteExchange[];
};

type ExchangeResponse = ExchangeSuccess | { ok: false; message: string };

export async function sendExchange(
  initiatorId: string,
  targetId: string,
  payload: SharePayload
): Promise<ExchangeResponse> {
  try {
    const response = await fetch('/api/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initiatorId, targetId, payload }),
    });
    const data = (await response.json()) as ExchangeResponse;
    if (!response.ok || !data.ok) {
      return {
        ok: false,
        message:
          ('message' in data && data.message) ||
          'Не удалось зафиксировать обмен на сервере.',
      };
    }
    return { ok: true, exchanges: [] };
  } catch (error) {
    console.error('[exchangeClient] sendExchange failed', error);
    return { ok: false, message: 'Ошибка сети при отправке обмена.' };
  }
}

export async function fetchPendingExchanges(profileId: string): Promise<ExchangeResponse> {
  if (!profileId) {
    return { ok: false, message: 'Не указан идентификатор профиля.' };
  }

  try {
    const response = await fetch(`/api/exchange?profileId=${encodeURIComponent(profileId)}`);
    const data = (await response.json()) as ExchangeResponse;
    if (!response.ok || !data.ok) {
      return {
        ok: false,
        message:
          ('message' in data && data.message) ||
          'Не удалось получить обмены с сервера.',
      };
    }
    return data;
  } catch (error) {
    console.error('[exchangeClient] fetchPendingExchanges failed', error);
    return { ok: false, message: 'Ошибка сети при запросе обменов.' };
  }
}
