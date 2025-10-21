import { useEffect } from 'react';
import { useRouter } from 'next/router';

/**
 * Redirect page that sends users to the QR generator by default.  
 * This allows `/app` to act as a root for authenticated pages.
 */
export default function AppRoot() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/app/qr');
  }, [router]);
  return null;
}