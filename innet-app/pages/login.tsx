import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';

/**
 * Login page. This simplistic implementation stores a flag in localStorage
 * indicating that the user is logged in. Replace with real authentication
 * logic when a backend is integrated. Registration and login flows are
 * deliberately lightweight so users can get started in under two minutes.
 */
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Basic validation
    if (!email || !password) {
      setError('Введите email и пароль');
      return;
    }
    // Persist pseudo‑auth state in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('innet_logged_in', 'true');
    }
    // Redirect to app
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
              <label htmlFor="email" className="block text-sm mb-1">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
          <p className="text-center text-sm text-gray-400 mt-4">
            Нет аккаунта? <Link href="/register" className="text-primary hover:underline">Зарегистрируйтесь</Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}