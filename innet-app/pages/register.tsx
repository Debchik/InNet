import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useForm } from 'react-hook-form';
import { createContact, saveContacts, loadContacts } from '../lib/storage';

type RegisterFormInputs = {
  name: string;
  email: string;
  password: string;
};

/**
 * Registration page using react-hook-form for validation.
 * Provides basic email syntax check and clear inline error display.
 */
export default function Register() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormInputs>();

  const onSubmit = (data: RegisterFormInputs) => {
    const { name, email, password } = data;

    if (typeof window !== 'undefined') {
      const contacts = loadContacts();
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

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm mb-1">Имя</label>
              <input
                id="name"
                type="text"
                {...register('name', { required: 'Введите имя' })}
                className={`w-full px-3 py-2 bg-gray-700 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${errors.name ? 'border-red-500' : 'border-gray-600'}`}
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm mb-1">Email</label>
              <input
                id="email"
                type="email"
                {...register('email', {
                  required: 'Введите email',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Некорректный формат email',
                  },
                })}
                className={`w-full px-3 py-2 bg-gray-700 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${errors.email ? 'border-red-500' : 'border-gray-600'}`}
              />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm mb-1">Пароль</label>
              <input
                id="password"
                type="password"
                {...register('password', {
                  required: 'Введите пароль',
                  minLength: { value: 6, message: 'Минимум 6 символов' },
                })}
                className={`w-full px-3 py-2 bg-gray-700 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${errors.password ? 'border-red-500' : 'border-gray-600'}`}
              />
              {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              className="w-full bg-primary text-background py-2 rounded-md hover:bg-secondary transition-colors"
            >
              Создать аккаунт
            </button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-4">
            Уже есть аккаунт?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Войти
            </Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}
