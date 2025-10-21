import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { createContact, saveContacts, loadContacts } from '../lib/storage';

/**
 * Registration page. Users provide their name, email and password. On submit
 * we create a pseudo contact record for the current user (id 'me'). Real
 * authentication flows will replace this logic in the future. The page
 * keeps the form simple to encourage quick sign up.
 */
export default function Register() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError('Заполните все поля');
      return;
    }
    // Simulate account creation by storing current user
    if (typeof window !== 'undefined') {
      // Save a contact representing this user as the current user for graph
      const contacts = loadContacts();
      // Mark as current user; not added to their own contact list but used for graph root
      localStorage.setItem('innet_current_user_name', name);
      localStorage.setItem('innet_logged_in', 'true');
      saveContacts(contacts);
    }
    router.push('/app/qr');
  };

  return (
    <Layout>
      <div className="flex items-center justify-center py-20 px-4">
        <div className="w-full max-w-md bg-gray-800 p-8 rounded-xl shadow">
          <h2 className="text-2xl font-bold mb-6 text-center">Регистрация</h2>
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm mb-1">Имя</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
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
            <button type="submit" className="w-full bg-primary text-background py-2 rounded-md hover:bg-secondary transition-colors">Создать аккаунт</button>
          </form>
          <p className="text-center text-sm text-gray-400 mt-4">
            Уже есть аккаунт? <Link href="/login" className="text-primary hover:underline">Войти</Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}