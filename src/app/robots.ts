import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://projectkit.deped.gov.ph';

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/login', '/register', '/assessments', '/dashboard'],
        disallow: ['/admin', '/admin/*', '/api/*'],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: ['/admin', '/admin/*', '/api/*'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
