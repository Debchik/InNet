import Link from 'next/link';
import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/router';

interface LayoutProps {
  children: ReactNode;
}

/**
 * A simple site-wide layout that wraps each page with a header and footer.  
 * The header contains basic navigation; adjust the links here as you
 * expand the application. The footer displays minimal metadata.
 */
export default function Layout({ children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const year = new Date().getFullYear();
  const isAppRoute = router.pathname.startsWith('/app');
  const isLandingHome = router.pathname === '/';
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (typeof window === 'undefined') return;

    const checkAuth = () => {
      const loggedIn = localStorage.getItem('innet_logged_in') === 'true';
      setIsAuthenticated(loggedIn);
    };

    const handleStorage = () => checkAuth();

    checkAuth();
    window.addEventListener('storage', handleStorage);
    window.addEventListener('innet-auth-refresh', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('innet-auth-refresh', handleStorage);
    };
  }, []);
  /* const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!isAppRoute) {
      setNotifications([]);
      return;
    }
    if (typeof window === 'undefined') return;

    const loadNotifications = () => {
      if (typeof window === 'undefined') return;
      const items: AppNotification[] = [];
      const emailVerified = localStorage.getItem('innet_current_user_verified') === 'true';
      const emailDismissed = localStorage.getItem('innet_dismiss_email_notification') === 'true';

      if (!emailVerified && !emailDismissed) {
        items.push({
          id: 'email-verification',
          content: (
            <span className="text-sm text-gray-100">
              Подтвердите почту, чтобы разблокировать весь функционал.{' '}
              <Link href="/app/profile" className="text-primary underline-offset-2 hover:underline">
                Перейти в профиль
              </Link>
            </span>
          ),
        });
      }

      const hasContacts =
        Boolean(localStorage.getItem('innet_current_user_phone')) ||
        Boolean(localStorage.getItem('innet_current_user_telegram')) ||
        Boolean(localStorage.getItem('innet_current_user_instagram'));
      const contactsDismissed = localStorage.getItem('innet_dismiss_contacts_notification') === 'true';

      if (!hasContacts && !contactsDismissed) {
        items.push({
          id: 'contacts',
          content: (
            <span className="text-sm text-gray-100">
              Добавьте телефон и соцсети в{' '}
              <Link href="/app/profile" className="text-primary underline-offset-2 hover:underline">
                профиле
              </Link>, чтобы делиться ими за пару секунд.
            </span>
          ),
        });
      }

      setNotifications(items);
    };

    const handleStorage = () => loadNotifications();
    const handleRefresh = () => loadNotifications();

    loadNotifications();
    window.addEventListener('storage', handleStorage);
    window.addEventListener('innet-refresh-notifications', handleRefresh);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('innet-refresh-notifications', handleRefresh);
    };
  }, [isAppRoute, router.asPath]);

  const dismissNotification = (id: AppNotification['id']) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
    if (typeof window === 'undefined') return;
    if (id === 'email-verification') {
      localStorage.setItem('innet_dismiss_email_notification', 'true');
    }
    if (id === 'contacts') {
      localStorage.setItem('innet_dismiss_contacts_notification', 'true');
    }
  }; */

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="relative flex items-center gap-4 border-b border-gray-700 px-4 py-3">
        <Link href="/" className="text-2xl font-bold text-primary">
          InNet
        </Link>
        {/* Центрированное меню на десктопе */}
        {isAppRoute && (
          <nav className="hidden md:flex space-x-6 text-sm absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Link href="/app/qr" className="hover:text-primary">
              QR
            </Link>
            <Link href="/app/graph" className="hover:text-primary">
              Сеть
            </Link>
            <Link href="/app/facts" className="hover:text-primary">
              Мои факты
            </Link>
            <Link href="/app/contacts" className="hover:text-primary">
              Контакты
            </Link>
            <Link href="/app/profile" className="hover:text-primary">
              Мой профиль
            </Link>
          </nav>
        )}
        {/* Мобильный гамбургер строго справа */}
        {isAppRoute && (
          <button
            className="md:hidden flex items-center justify-center p-2 ml-2 rounded focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label={mobileMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
            onClick={() => setMobileMenuOpen((v) => !v)}
            style={{ marginLeft: 'auto' }}
          >
            {mobileMenuOpen ? (
              <svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path stroke="#fff" strokeWidth="2" strokeLinecap="round" d="M6 6l12 12M6 18L18 6"/></svg>
            ) : (
              <svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path stroke="#fff" strokeWidth="2" strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16"/></svg>
            )}
          </button>
        )}
        {isLandingHome && (
          <div className="ml-auto flex items-center gap-3 text-sm">
            {hydrated && isAuthenticated ? (
              <Link
                href="/app/qr"
                className="rounded-full bg-primary px-4 py-2 font-semibold text-background transition hover:bg-secondary"
              >
                Личный кабинет
              </Link>
            ) : (
              <>
                <Link href="/login" className="transition hover:text-primary">
                  Войти
                </Link>
                <Link
                  href="/register"
                  className="rounded-full bg-primary px-4 py-2 font-semibold text-background transition hover:bg-secondary"
                >
                  Регистрация
                </Link>
              </>
            )}
          </div>
        )}
        {/* Модальное меню для мобильных */}
        {isAppRoute && mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-end md:hidden" onClick={() => setMobileMenuOpen(false)}>
            <nav
              className="w-64 bg-gray-900 h-full shadow-lg flex flex-col pt-8 px-6 gap-2 animate-slide-in-right"
              onClick={e => e.stopPropagation()}
            >
              <button
                className="self-end mb-6 p-2 rounded hover:bg-gray-800"
                aria-label="Закрыть меню"
                onClick={() => setMobileMenuOpen(false)}
              >
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path stroke="#fff" strokeWidth="2" strokeLinecap="round" d="M6 6l12 12M6 18L18 6"/></svg>
              </button>
              <Link href="/app/qr" className="py-3 px-2 rounded hover:bg-primary/20 text-lg font-medium" onClick={() => setMobileMenuOpen(false)}>
                QR
              </Link>
              <Link href="/app/graph" className="py-3 px-2 rounded hover:bg-primary/20 text-lg font-medium" onClick={() => setMobileMenuOpen(false)}>
                Сеть
              </Link>
              <Link href="/app/facts" className="py-3 px-2 rounded hover:bg-primary/20 text-lg font-medium" onClick={() => setMobileMenuOpen(false)}>
                Мои факты
              </Link>
              <Link href="/app/contacts" className="py-3 px-2 rounded hover:bg-primary/20 text-lg font-medium" onClick={() => setMobileMenuOpen(false)}>
                Контакты
              </Link>
              <Link href="/app/profile" className="py-3 px-2 rounded hover:bg-primary/20 text-lg font-medium" onClick={() => setMobileMenuOpen(false)}>
                Мой профиль
              </Link>
            </nav>
          </div>
        )}
      </header>
      {/* {isAppRoute && notifications.length > 0 && (
        <div className="px-4 pt-4 space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className="relative flex items-start gap-3 rounded-lg border border-gray-700 bg-gray-800/80 px-4 py-3 text-sm text-gray-200 shadow-sm"
            >
              <div className="flex-1">{notification.content}</div>
              <button
                type="button"
                onClick={() => dismissNotification(notification.id)}
                className="text-gray-400 hover:text-gray-100 transition-colors"
                aria-label="Скрыть уведомление"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )} */}
      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-0">
        {children}
      </main>
      {/* Footer */}
      <footer className="px-4 py-6 text-center text-xs text-gray-500 border-t border-gray-700">
        © {year} InNet. Все права защищены.
      </footer>
    </div>
  );
}
