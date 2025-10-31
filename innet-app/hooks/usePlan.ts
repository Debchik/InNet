import { useEffect, useState } from 'react';
import {
  getCurrentPlan,
  getEntitlementsForCurrentPlan,
  PlanEntitlements,
  PlanId,
} from '../lib/subscription';

type PlanState = {
  plan: PlanId;
  entitlements: PlanEntitlements;
};

export function usePlan(): PlanState {
  const [state, setState] = useState<PlanState>(() => {
    const initialPlan = getCurrentPlan();
    return { plan: initialPlan, entitlements: getEntitlementsForCurrentPlan() };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      const nextPlan = getCurrentPlan();
      setState({ plan: nextPlan, entitlements: getEntitlementsForCurrentPlan() });
    };
    update();
    const handlePlanUpdated = () => update();
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === 'innet_current_plan') {
        update();
      }
    };
    window.addEventListener('innet-plan-updated', handlePlanUpdated);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('innet-plan-updated', handlePlanUpdated);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return state;
}
