import Link from 'next/link';
import { ReactNode } from 'react';
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
  const router = useRouter();
  const year = new Date().getFullYear();
  const isAppRoute = router.pathname.startsWith('/app');
  const isLandingHome = router.pathname === '/';
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center px-4 py-3 border-b border-gray-700 gap-4">
        <Link href="/" className="text-2xl font-bold text-primary">
          InNet
        </Link>
        <div className="flex-1 flex justify-center">
          {isAppRoute && (
            <nav className="hidden md:flex space-x-6 text-sm">
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
            </nav>
          )}
        </div>
        <div className="flex items-center space-x-4 text-sm">
          {isLandingHome && (
            <>
              <Link href="/login" className="hover:text-primary">
                Войти
              </Link>
              <Link href="/register" className="bg-primary text-background px-3 py-1 rounded-md hover:bg-secondary transition-colors">
                Регистрация
              </Link>
            </>
          )}
        </div>
      </header>
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
