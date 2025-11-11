import { useEffect, useState } from 'react';
import { getTokenBalance, subscribeToTokenBalance } from '../lib/tokens';

export function useTokens(): { balance: number } {
  const [balance, setBalance] = useState(() => getTokenBalance());

  useEffect(() => {
    const unsubscribe = subscribeToTokenBalance(() => {
      setBalance(getTokenBalance());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return { balance };
}
