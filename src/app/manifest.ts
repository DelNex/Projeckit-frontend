import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Project KIT — DepEd Academic Assessment System',
    short_name: 'Project KIT',
    description: 'Automated DepEd Optical Mark Recognition (OMR), Table of Specifications (TOS), and E-Class Record grading system for Capas Senior High School.',
    start_url: '/',
    display: 'standalone',
    background_color: '#030712',
    theme_color: '#2563eb',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  };
}
