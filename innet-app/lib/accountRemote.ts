import type { UserAccount } from './storage';

type ApiResponse<T> =
  | ({ ok: true } & T)
  | { ok: false; message: string };

async function request<T>(
  url: string,
  options: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });

    const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
    if (!payload) {
      return {
        ok: false,
        message: 'Сервер вернул пустой ответ. Попробуйте позже.',
      };
    }

    if (!response.ok) {
      return payload;
    }

    return payload;
  } catch (error) {
    console.error('[accountRemote] Request failed', error);
    return {
      ok: false,
      message: 'Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.',
    };
  }
}

export async function registerRemoteAccount(
  user: UserAccount,
  password: string
): Promise<ApiResponse<{ user: Omit<UserAccount, 'password'> }>> {
  return request<{ user: Omit<UserAccount, 'password'> }>('/api/account/register', {
    method: 'POST',
    body: JSON.stringify({ user, password }),
  });
}

export async function loginRemoteAccount(
  identifier: string,
  password: string
): Promise<ApiResponse<{ user: Omit<UserAccount, 'password'> }>> {
  return request<{ user: Omit<UserAccount, 'password'> }>('/api/account/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
}

export async function updateRemoteAccount(
  user: UserAccount,
  password?: string
): Promise<ApiResponse<Record<string, never>>> {
  return request<Record<string, never>>('/api/account/update', {
    method: 'PUT',
    body: JSON.stringify({ user, password: password ?? null }),
  });
}
