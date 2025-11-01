'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { getSupabaseClient } from '../../lib/supabaseClient';

export default function AuthCallback() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const run = async () => {
      let supabase: SupabaseClient;
      try {
        supabase = getSupabaseClient();
      } catch (error) {
        console.error('[auth/callback] Supabase client unavailable', error);
        if (active) {
          setErrorMessage(
            'Не удаётся подключиться к Supabase. Проверьте переменные NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY.'
          );
        }
        return;
      }
      const currentUrl = new URL(window.location.href);
      const code = currentUrl.searchParams.get('code');
      const errorParam = currentUrl.searchParams.get('error');
      const errorDescription = currentUrl.searchParams.get('error_description');

      if (code) {
        try {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.error('[auth/callback] Failed to exchange OAuth code', exchangeError);
            return router.replace('/login');
          }
          
          // Wait to ensure session is properly set
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Verify we have a valid session
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError || !user) {
            console.error('[auth/callback] No valid user after session exchange:', userError);
            return router.replace('/login');
          }

          try {
            if (user.email) {
              window.sessionStorage.setItem('innet_oauth_email', user.email);
            }
            if (user.id) {
              window.sessionStorage.setItem('innet_oauth_supabase_uid', user.id);
            }
            const fullName = (user.user_metadata?.full_name as string | undefined)?.trim();
            if (fullName) {
              window.sessionStorage.setItem('innet_oauth_full_name', fullName);
            }
          } catch (storageError) {
            console.warn('[auth/callback] Unable to persist OAuth prefill data', storageError);
          }

          currentUrl.searchParams.delete('code');
          currentUrl.searchParams.delete('state');
          try {
            const cleanedSearch = currentUrl.searchParams.toString();
            const nextUrl = `${currentUrl.pathname}${cleanedSearch ? `?${cleanedSearch}` : ''}${currentUrl.hash}`;
            window.history.replaceState({}, document.title, nextUrl);
          } catch {
            // ignore cleanup errors (e.g., Safari private mode)
          }
        } catch (error) {
          console.error('[auth/callback] Unexpected error while exchanging OAuth code', error);
          return router.replace('/login');
        }
      }

      if (errorParam) {
        console.warn('[auth/callback] OAuth provider returned an error', { errorParam, errorDescription });
      }
      const normalizeNext = (value: string | undefined) => {
        if (!value) return undefined;
        let decoded = value;
        try {
          decoded = decodeURIComponent(value);
        } catch {
          // value might already be decoded or malformed; fall back to original
          decoded = value;
        }
        if (decoded.startsWith('/')) {
          return decoded;
        }
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          try {
            const currentOrigin = window.location.origin;
            const url = new URL(decoded);
            if (url.origin === currentOrigin) {
              return `${url.pathname}${url.search}` || '/';
            }
          } catch {
            /* ignore parsing issues */
          }
        }
        return undefined;
      };

      const params = currentUrl.searchParams;
      const rawNext = params.get('next') || undefined;
      const typeParam = params.get('type') || undefined;
      const providerParam = params.get('provider') || undefined;
      const storedNext =
        ((): string | undefined => {
          try {
            const value = window.sessionStorage.getItem('innet_oauth_redirect');
            window.sessionStorage.removeItem('innet_oauth_redirect');
            return value || undefined;
          } catch {
            return undefined;
          }
        })();

      let target = normalizeNext(rawNext);
      if (!target) {
        target = normalizeNext(storedNext);
      }
      if (!target) {
        if (typeParam === 'signup') {
          const provider = providerParam || 'google';
          target = `/register?oauth=${encodeURIComponent(provider)}`;
        } else {
          target = '/app/qr';
        }
      }

      if (!active) return;
      void router.replace(target);
      // Fallback на случай, если клиентский роутер не сработал.
      setTimeout(() => {
        if (!active) return;
        const current = `${window.location.pathname}${window.location.search}`;
        if (current !== target) {
          window.location.replace(target);
        }
      }, 120);
    };

    void run();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <Layout>
      <div className="flex items-center justify-center py-20 text-gray-300">
        {errorMessage ?? 'Завершаем вход...'}
      </div>
    </Layout>
  );
}
