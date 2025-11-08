import type { GetServerSideProps } from 'next';
import { seoConfig } from '../lib/seo';

const STATIC_ROUTES = ['/', '/login', '/register', '/legal/offer', '/legal/requisites', '/share'];

const buildSitemap = (urls: string[]) => {
  const lastMod = new Date().toISOString();
  const entries = urls
    .map((url) => {
      const isHome = url === '/';
      return `
    <url>
      <loc>${seoConfig.siteUrl}${url}</loc>
      <changefreq>${isHome ? 'daily' : 'weekly'}</changefreq>
      <priority>${isHome ? '1.0' : '0.6'}</priority>
      <lastmod>${lastMod}</lastmod>
    </url>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}
</urlset>`;
};

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const urls = STATIC_ROUTES;
  const sitemap = buildSitemap(urls);

  res.setHeader('Content-Type', 'text/xml');
  res.write(sitemap);
  res.end();

  return { props: {} };
};

export default function Sitemap() {
  return null;
}
