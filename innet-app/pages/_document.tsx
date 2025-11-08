import { Html, Head, Main, NextScript } from 'next/document';
import { seoConfig } from '../lib/seo';

export default function Document() {
  return (
    <Html lang="ru">
      <Head>
        <meta name="application-name" content={seoConfig.siteName} />
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#050608" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content={seoConfig.siteName} />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/landing.png" />
      </Head>
      <body className="bg-background text-foreground antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
