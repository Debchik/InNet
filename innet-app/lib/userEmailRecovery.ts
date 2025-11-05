import { loadUsers, saveUsers, type UserAccount } from './storage';
import { updateRemoteAccount } from './accountRemote';

type RecoverResponse =
  | { ok: true; email: string | null }
  | { ok: false; message: string };

export type EmailRecoveryResult = {
  email: string;
  user: UserAccount;
};

/**
 * Attempt to fetch an email for the supplied Supabase auth user and merge it into
 * the local user store. Returns the updated user when an email is recovered.
 */
export async function recoverSupabaseEmailAndUpdateLocal(
  supabaseUid: string,
  fallbackUser?: UserAccount
): Promise<EmailRecoveryResult | null> {
  const trimmedUid = supabaseUid?.trim();
  if (!trimmedUid) {
    return null;
  }

  let response: Response;
  try {
    response = await fetch('/api/user/recover-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabaseUid: trimmedUid }),
    });
  } catch (error) {
    console.warn('[emailRecovery] Request to recover Supabase email failed', error);
    return null;
  }

  if (!response.ok) {
    return null;
  }

  let payload: RecoverResponse;
  try {
    payload = (await response.json()) as RecoverResponse;
  } catch (error) {
    console.warn('[emailRecovery] Unable to parse Supabase email response', error);
    return null;
  }

  if (!payload.ok || !payload.email) {
    return null;
  }

  const normalizedEmail = payload.email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  if (typeof window === 'undefined') {
    return fallbackUser
      ? { email: normalizedEmail, user: { ...fallbackUser, email: normalizedEmail } }
      : null;
  }

  const users = loadUsers();
  let matchedUser: UserAccount | undefined = users.find(
    (entry) => entry.supabaseUid?.trim() === trimmedUid
  );

  if (!matchedUser && fallbackUser) {
    matchedUser = fallbackUser;
  }

  if (!matchedUser) {
    console.warn(
      '[emailRecovery] Supabase user recovered email but local profile is missing',
      trimmedUid
    );
    return null;
  }

  const updatedUser: UserAccount = {
    ...matchedUser,
    email: normalizedEmail,
    supabaseUid: trimmedUid,
  };

  const deduplicated = users.filter((entry) => {
    if (entry.id === updatedUser.id) {
      return false;
    }
    if (entry.supabaseUid?.trim() === trimmedUid) {
      return false;
    }
    const entryEmail = entry.email.trim().toLowerCase();
    if (entryEmail && entryEmail === normalizedEmail) {
      return false;
    }
    return true;
  });

  saveUsers([...deduplicated, updatedUser]);
  void updateRemoteAccount(updatedUser).then((result) => {
    if (!result.ok) {
      console.warn('[emailRecovery] Failed to sync recovered email', result.message);
    }
  });

  try {
    const currentId = localStorage.getItem('innet_current_user_id');
    if (currentId && currentId === updatedUser.id) {
      localStorage.setItem('innet_current_user_email', updatedUser.email);
      localStorage.setItem('innet_current_user_supabase_uid', trimmedUid);
    }
  } catch (error) {
    console.warn('[emailRecovery] Unable to update local session cache', error);
  }

  return { email: normalizedEmail, user: updatedUser };
}
