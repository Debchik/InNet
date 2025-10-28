'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { getSupabaseClient } from '../../lib/supabaseClient';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const supabase = getSupabaseClient();
      try {
        await supabase.auth.exchangeCodeForSession(window.location.href);
      } catch {
        // ignore; session may already be set
      }
      const next = (router.query.next as string) || '/app/qr';
      router.replace(next);
    };
    if (router.isReady) void run();
  }, [router]);

  return (
    <Layout>
      <div className="flex items-center justify-center py-20 text-gray-300">
        Завершаем вход...
      </div>
    </Layout>
  );
}

