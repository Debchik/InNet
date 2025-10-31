import { useEffect, useMemo, useState } from 'react';
import {
  allowedPrivacyLevels,
  getPrivacyLevel,
  PrivacyLevel,
  sanityCheckPrivacyLevel,
  setPrivacyLevel,
  subscribeToPrivacyChanges,
} from '../lib/privacy';
import type { PlanEntitlements } from '../lib/plans';

export function usePrivacy(entitlements: PlanEntitlements) {
  const [level, setLevel] = useState<PrivacyLevel>(() =>
    sanityCheckPrivacyLevel(getPrivacyLevel(), entitlements)
  );

  useEffect(() => {
    const sync = () => {
      setLevel((current) => {
        const next = sanityCheckPrivacyLevel(getPrivacyLevel(), entitlements);
        if (next !== current) {
          return next;
        }
        return current;
      });
    };
    const unsubscribe = subscribeToPrivacyChanges(sync);
    sync();
    return () => {
      unsubscribe();
    };
  }, [entitlements]);

  useEffect(() => {
    setLevel((current) => {
      const sanitized = sanityCheckPrivacyLevel(current, entitlements);
      if (sanitized !== current) {
        if (typeof window !== 'undefined') {
          setPrivacyLevel(sanitized);
        }
        return sanitized;
      }
      return current;
    });
  }, [entitlements]);

  const options = useMemo(
    () => allowedPrivacyLevels(entitlements),
    [entitlements]
  );

  const update = (next: PrivacyLevel) => {
    const sanitized = sanityCheckPrivacyLevel(next, entitlements);
    setPrivacyLevel(sanitized);
    setLevel(sanitized);
  };

  return { level, setLevel: update, options };
}

export type { PrivacyLevel } from '../lib/privacy';
