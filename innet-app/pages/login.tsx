import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import {
  convertFactsToGroups,
  loadUsers,
  saveFactGroups,
  saveUsers,
  type UserAccount,
} from '../lib/storage';
import { getSupabaseClient } from '../lib/supabaseClient';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_PLAN } from '../lib/plans';
import { setCurrentPlan } from '../lib/subscription';
import { normalizePhone } from '../utils/contact';
import { recoverSupabaseEmailAndUpdateLocal } from '../lib/userEmailRecovery';

/**
 * Login page. This simplistic implementation stores a flag in localStorage
 * indicating that the user is logged in. Replace with real authentication
 * logic when a backend is integrated. Registration and login flows are
 * deliberately lightweight so users can get started in under two minutes.
 */
export default function Login() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const supabase = useMemo(() => {
    try { return getSupabaseClient(); } catch { return null; }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const syncFromSession = async () => {
      const { data } = await supabase.auth.getUser();
      const sUser = data.user;
      if (!sUser) return;
      const supabaseUid = sUser.id?.trim() ?? '';
      const supabaseEmail = sUser.email?.trim().toLowerCase() ?? '';
      const fullName = (sUser.user_metadata?.full_name as string | undefined)?.trim() || '';

      const users = loadUsers();
      let user: UserAccount | undefined =
        users.find((entry) => supabaseUid && entry.supabaseUid?.trim() === supabaseUid) ??
        (supabaseEmail
          ? users.find(
              (entry) => entry.email.trim().toLowerCase() === supabaseEmail
            )
          : undefined);

      let updatedUsers = users;
      if (!user) {
        user = {
          id: uuidv4(),
          email: supabaseEmail || supabaseUid,
          password: uuidv4().slice(0, 12),
          name: fullName || 'Без имени',
          surname: undefined,
          avatar: undefined,
          avatarType: undefined,
          categories: [],
          factsByCategory: {},
          phone: undefined,
          telegram: undefined,
          instagram: undefined,
          createdAt: Date.now(),
          verified: Boolean(sUser.email_confirmed_at),
          plan: DEFAULT_PLAN,
          planActivatedAt: Date.now(),
          supabaseUid: supabaseUid || null,
        };
        updatedUsers = [user, ...users];
        saveUsers(updatedUsers);
      } else {
        let modified = false;
        let nextUser = user;
        if (supabaseUid && user.supabaseUid !== supabaseUid) {
          nextUser = { ...nextUser, supabaseUid };
          modified = true;
        }
        if (supabaseEmail && user.email.trim().toLowerCase() !== supabaseEmail) {
          nextUser = { ...nextUser, email: supabaseEmail };
          modified = true;
        }
        if (fullName && user.name !== fullName) {
          nextUser = { ...nextUser, name: user.name || fullName };
        }
        if (modified || nextUser !== user) {
          updatedUsers = users.map((entry) => (entry.id === nextUser.id ? nextUser : entry));
          saveUsers(updatedUsers);
          user = nextUser;
        }
      }

      if (supabaseUid && !supabaseEmail) {
        const recovery = await recoverSupabaseEmailAndUpdateLocal(supabaseUid, user);
        if (recovery?.email) {
          user = recovery.user;
        }
      }

      if (!user) return;
      try {
        localStorage.setItem('innet_logged_in', 'true');
        localStorage.setItem('innet_current_user_id', user.id);
        if (user.email) {
          localStorage.setItem('innet_current_user_email', user.email);
        } else {
          localStorage.removeItem('innet_current_user_email');
        }
        if (user.supabaseUid) {
          localStorage.setItem('innet_current_user_supabase_uid', user.supabaseUid);
        } else {
          localStorage.removeItem('innet_current_user_supabase_uid');
        }
        localStorage.setItem('innet_current_user_name', user.name);
        localStorage.setItem('innet_current_user_categories', JSON.stringify(user.categories ?? []));
        localStorage.setItem('innet_current_user_facts', JSON.stringify(user.factsByCategory ?? {}));
        localStorage.setItem('innet_current_user_verified', user.verified ? 'true' : 'false');
        localStorage.setItem('innet_qr_select_all_groups', 'true');
        window.dispatchEvent(new Event('innet-auth-refresh'));
        saveFactGroups(convertFactsToGroups(user.factsByCategory ?? {}));
        setCurrentPlan(user.plan ?? DEFAULT_PLAN);
      } catch (err) {
        console.warn('[login] Failed to establish local session', err);
      }
      router.replace('/app/qr');
    };
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void syncFromSession();
    });
    void syncFromSession();
    return () => { sub.subscription.unsubscribe(); };
  }, [router, supabase]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Basic validation
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier || !password) {
      setError('Введите email или телефон и пароль');
      return;
    }
    const users = loadUsers();
    const normalizedLogin = trimmedIdentifier.toLowerCase();
    const normalizedPhone = normalizePhone(trimmedIdentifier);
    const user = users.find((entry) => {
      const entryLogin = entry.email.trim().toLowerCase();
      if (entryLogin === normalizedLogin) {
        return true;
      }
      if (normalizedPhone) {
        const entryPhone = entry.phone ? normalizePhone(entry.phone) : '';
        if (entryPhone && entryPhone === normalizedPhone) {
          return true;
        }
        const emailAsPhone = normalizePhone(entry.email);
        if (emailAsPhone && emailAsPhone === normalizedPhone) {
          return true;
        }
      }
      return false;
    });

    if (!user) {
      setError('Аккаунт с таким email или телефоном не найден. Зарегистрируйтесь.');
      return;
    }

    if (user.password !== password) {
      setError('Неверный пароль. Попробуйте ещё раз.');
      return;
    }

    /* if (!user.verified) {
      setError('Подтвердите почту по ссылке из письма, чтобы войти.');
      return;
    } */

    if (typeof window !== 'undefined') {
      localStorage.setItem('innet_logged_in', 'true');
      localStorage.setItem('innet_current_user_id', user.id);
      if (user.email) {
        localStorage.setItem('innet_current_user_email', user.email);
      } else {
        localStorage.removeItem('innet_current_user_email');
      }
      if (user.supabaseUid) {
        localStorage.setItem('innet_current_user_supabase_uid', user.supabaseUid);
      } else {
        localStorage.removeItem('innet_current_user_supabase_uid');
      }
      localStorage.setItem('innet_current_user_name', user.name);
      localStorage.setItem('innet_current_user_categories', JSON.stringify(user.categories));
      localStorage.setItem('innet_current_user_facts', JSON.stringify(user.factsByCategory));
      localStorage.setItem('innet_qr_select_all_groups', 'true');
      localStorage.setItem('innet_current_user_verified', user.verified ? 'true' : 'false');
      saveFactGroups(convertFactsToGroups(user.factsByCategory));

      if (user.surname) {
        localStorage.setItem('innet_current_user_surname', user.surname);
      } else {
        localStorage.removeItem('innet_current_user_surname');
      }

      if (user.phone) {
        localStorage.setItem('innet_current_user_phone', user.phone);
      } else {
        localStorage.removeItem('innet_current_user_phone');
      }

      if (user.telegram) {
        localStorage.setItem('innet_current_user_telegram', user.telegram);
      } else {
        localStorage.removeItem('innet_current_user_telegram');
      }

      if (user.instagram) {
        localStorage.setItem('innet_current_user_instagram', user.instagram);
      } else {
        localStorage.removeItem('innet_current_user_instagram');
      }

      if (user.avatar) {
        localStorage.setItem('innet_current_user_avatar', user.avatar);
      } else {
        localStorage.removeItem('innet_current_user_avatar');
      }

      if (user.avatarType) {
        localStorage.setItem('innet_current_user_avatar_type', user.avatarType);
      } else {
        localStorage.removeItem('innet_current_user_avatar_type');
      }

      window.dispatchEvent(new Event('innet-auth-refresh'));
      setCurrentPlan(user.plan ?? DEFAULT_PLAN);
    }

    router.push('/app/qr');
  };

  return (
    <Layout>
      <div className="flex items-center justify-center py-20 px-4">
        <div className="w-full max-w-md bg-gray-800 p-8 rounded-xl shadow">
          <h2 className="text-2xl font-bold mb-6 text-center">Вход в InNet</h2>
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="identifier" className="block text-sm mb-1">
                Email или телефон
              </label>
              <input
                id="identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm mb-1">Пароль</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button type="submit" className="w-full bg-primary text-background py-2 rounded-md hover:bg-secondary transition-colors">Войти</button>
          </form>
          {supabase && (
            <button
              type="button"
              onClick={() => {
                if (!supabase) return;
                const next = encodeURIComponent('/app/qr');
                const redirectTo = `${window.location.origin}/auth/callback?type=login&provider=google&next=${next}`;
                try {
                  window.sessionStorage.setItem('innet_oauth_redirect', '/app/qr');
                } catch {/* ignore storage */}
                void supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
              }}
              className="mt-3 w-full border border-gray-600 text-gray-100 py-2 rounded-md hover:border-primary transition-colors"
            >
              Войти через Google
            </button>
          )}
          <p className="text-center text-sm text-gray-400 mt-4">
            Нет аккаунта? <Link href="/register" className="text-primary hover:underline">Зарегистрируйтесь</Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}
