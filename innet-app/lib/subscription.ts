import { DEFAULT_PLAN, getPlanEntitlements, PlanEntitlements, PlanId } from './plans';
import { loadUsers, saveUsers, type UserAccount } from './storage';
import { updateRemoteAccount } from './accountRemote';

const PLAN_STORAGE_KEY = 'innet_current_plan';

declare global {
  interface WindowEventMap {
    'innet-plan-updated': Event;
  }
}

export function normalizePlanId(value: string | null | undefined): PlanId {
  return value === 'pro' ? 'pro' : 'free';
}

export function getCurrentPlan(): PlanId {
  if (typeof window === 'undefined') {
    return DEFAULT_PLAN;
  }

  const direct = normalizePlanId(localStorage.getItem(PLAN_STORAGE_KEY));
  if (direct) {
    return direct;
  }

  const storedUserId = localStorage.getItem('innet_current_user_id');
  if (storedUserId) {
    try {
      const users = loadUsers();
      const current = users.find((user) => user.id === storedUserId);
      if (current?.plan) {
        const normalized = normalizePlanId(current.plan);
        localStorage.setItem(PLAN_STORAGE_KEY, normalized);
        return normalized;
      }
    } catch {
      /* ignore fallback */
    }
  }

  return DEFAULT_PLAN;
}

export function setCurrentPlan(plan: PlanId): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PLAN_STORAGE_KEY, plan);

  const storedUserId = localStorage.getItem('innet_current_user_id');
  if (storedUserId) {
    try {
      const users = loadUsers();
      let remoteCandidate: UserAccount | undefined;
      const updated = users.map((user) => {
        if (user.id !== storedUserId) {
          return user;
        }
        const planChanged = user.plan !== plan;
        const next: UserAccount = {
          ...user,
          plan,
          planActivatedAt: planChanged ? Date.now() : user.planActivatedAt ?? Date.now(),
        };
        remoteCandidate = next;
        return next;
      });
      saveUsers(updated);
      if (remoteCandidate) {
        void updateRemoteAccount(remoteCandidate).then((result) => {
          if (!result.ok) {
            console.warn('[subscription] Failed to sync plan with Supabase', result.message);
          }
        });
      }
    } catch {
      /* ignore */
    }
  }

  window.dispatchEvent(new Event('innet-plan-updated'));
}

export function clearCachedPlan(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PLAN_STORAGE_KEY);
  window.dispatchEvent(new Event('innet-plan-updated'));
}

export function getEntitlementsForCurrentPlan(): PlanEntitlements {
  return getPlanEntitlements(getCurrentPlan());
}

export function subscribeToPlanChanges(listener: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const handler = () => listener();
  window.addEventListener('innet-plan-updated', handler);
  const storageHandler = (event: StorageEvent) => {
    if (event.key === PLAN_STORAGE_KEY || event.key === null) {
      handler();
    }
  };
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener('innet-plan-updated', handler);
    window.removeEventListener('storage', storageHandler);
  };
}

export type { PlanId, PlanEntitlements } from './plans';
