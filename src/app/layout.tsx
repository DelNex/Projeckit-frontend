import type { Metadata, Viewport } from 'next';
import './globals.css';
import { NavigationProgress } from '@/components/layout/NavigationProgress';
import { ToastProvider } from '@/components/ui/toast';
import { TenantProvider } from '@/context/TenantContext';
import { Suspense } from 'react';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://projectkit.deped.gov.ph';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Project KIT — DepEd Academic Assessment & Automated OMR Grading System',
    template: '%s | Project KIT — Assessment & Academic Analytics',
  },
  description:
    'Project KIT is the official automated academic assessment and analytics platform for Philippine DepEd institutions. Features high-precision camera OMR answer sheet scanning, automated item analysis, Table of Specifications (TOS) generator, and DepEd Order No. 8, s. 2015 compliant grading.',
  applicationName: 'Project KIT',
  authors: [
    { name: 'Department of Education — Republic of the Philippines' },
  ],
  generator: 'Next.js',
  keywords: [
    'Project KIT',
    'DepEd',
    'Department of Education',
    'DepEd OMR',
    'OMR scanner camera',
    'optical mark recognition',
    'answer sheet scanner',
    'Table of Specifications',
    'TOS generator DepEd',
    'DepEd Order No. 8 s. 2015',
    'electronic class record',
    'E-Class Record SHS',
    'transmuted grades',
    'Senior High School grading system',
    'item analysis table',
    'deped grading calculator',
    'written works performance tasks quarterly assessment',
  ],
  creator: 'Project KIT ICT & Faculty',
  publisher: 'Department of Education — Republic of the Philippines',
  category: 'Education / Academic Assessment Software',
  classification: 'Educational Assessment & Grading Platform',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Project KIT — DepEd Academic Assessment & Automated OMR Grading System',
    description:
      'Official academic assessment platform. High-precision camera OMR scanning, automated item analysis, Table of Specifications (TOS), and DepEd Order No. 8 compliant grading.',
    url: siteUrl,
    siteName: 'Project KIT',
    locale: 'en_PH',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Project KIT — DepEd Academic Assessment System',
    description:
      'High-precision camera OMR scanning, TOS generator, and DepEd academic analytics.',
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
    ],
    apple: [{ url: '/favicon.ico' }],
  },
  other: {
    'google-site-verification': '530ffdb1a0b8807b',
    'apple-mobile-web-app-title': 'Project KIT',
    'application-name': 'Project KIT',
    'msapplication-TileColor': '#2563eb',
    'theme-color': '#2563eb',
    'rating': 'General',
    'distribution': 'Global',
    'revisit-after': '7 days',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#030712' },
  ],
};

const jsonLdData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: 'Project KIT',
      description: 'DepEd Academic Assessment System & Automated OMR Grading Platform',
      publisher: {
        '@id': `${siteUrl}/#organization`,
      },
      inLanguage: 'en-PH',
    },
    {
      '@type': 'EducationalOrganization',
      '@id': `${siteUrl}/#organization`,
      name: 'Department of Education — Republic of the Philippines',
      alternateName: 'Project KIT',
      url: siteUrl,
      department: {
        '@type': 'GovernmentOrganization',
        name: 'Department of Education — Republic of the Philippines',
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${siteUrl}/#software`,
      name: 'Project KIT Academic Assessment Engine',
      operatingSystem: 'Web, Android, iOS, Windows, macOS, Linux',
      applicationCategory: 'EducationalApplication',
      description:
        'Automated real-time OMR test sheet scanner, Table of Specifications (TOS) generator, psychometric item analysis, and DepEd Order No. 8, s. 2015 grading calculator.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'PHP',
      },
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLdData),
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const storedTheme = localStorage.getItem('darkMode');
                if (storedTheme === 'true' || (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <ToastProvider>
          <TenantProvider>{children}</TenantProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
