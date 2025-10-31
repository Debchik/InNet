import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { ReminderProvider } from '../hooks/useReminders';

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ReminderProvider>
      <Component {...pageProps} />
    </ReminderProvider>
  );
}
