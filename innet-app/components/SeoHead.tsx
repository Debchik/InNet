import Head from 'next/head';
import { useRouter } from 'next/router';
import { buildCanonicalUrl, seoConfig } from '../lib/seo';

export type SchemaEntity = Record<string, unknown>;

export type SeoHeadProps = {
  title?: string;
  description?: string;
  keywords?: string[];
  image?: string;
  canonical?: string;
  noIndex?: boolean;
  structuredData?: SchemaEntity | SchemaEntity[];
};

export default function SeoHead({
  title,
  description,
  keywords,
  image,
  canonical,
  noIndex,
  structuredData,
}: SeoHeadProps) {
  const router = useRouter();
  const asPath = router?.asPath || router?.pathname || '/';
  const canonicalUrl = buildCanonicalUrl(canonical ?? asPath);

  const resolvedTitle = title ?? seoConfig.defaultTitle;
  const resolvedDescription = description ?? seoConfig.defaultDescription;
  const resolvedImage = image ?? seoConfig.defaultOgImage;
  const robots = noIndex ? 'noindex, nofollow' : 'index, follow';

  const mergedKeywords = keywords?.length
    ? Array.from(new Set([...seoConfig.defaultKeywords, ...keywords])).join(', ')
    : seoConfig.defaultKeywords.join(', ');

  const structuredDataList = structuredData
    ? Array.isArray(structuredData)
        ? structuredData
        : [structuredData]
    : [];

  return (
    <Head>
      <title>{resolvedTitle}</title>
      <meta name="description" content={resolvedDescription} />
      <meta name="keywords" content={mergedKeywords} />
      <meta name="robots" content={robots} />
      <meta property="og:title" content={resolvedTitle} />
      <meta property="og:description" content={resolvedDescription} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={seoConfig.siteName} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={resolvedImage} />
      <meta property="og:locale" content={seoConfig.locale} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={resolvedTitle} />
      <meta name="twitter:description" content={resolvedDescription} />
      <meta name="twitter:image" content={resolvedImage} />
      <link rel="canonical" href={canonicalUrl} />
      {structuredDataList.map((item, index) => (
        <script
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
          key={index}
          type="application/ld+json"
        />
      ))}
    </Head>
  );
}
