export type RemoteProfilePayload = {
  email: string;
  name?: string;
  surname?: string;
  phone?: string;
  telegram?: string;
  instagram?: string;
};

export async function syncProfileToSupabase(payload: RemoteProfilePayload): Promise<void> {
  try {
    const response = await fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message =
        typeof body?.message === 'string'
          ? body.message
          : 'Supabase: не удалось синхронизировать профиль.';
      throw new Error(message);
    }
  } catch (error) {
    console.warn('[profileSync] Failed to sync profile to Supabase', error);
  }
}
