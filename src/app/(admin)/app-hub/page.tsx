'use client';

import { ExternalLink } from 'lucide-react';

export default function AppHubPage() {
  const hubs = [
    {
      title: 'DepEd LRMDS',
      desc: 'Browse teaching and learning resources',
      category: 'Instructional',
      url: 'https://lrmds.deped.gov.ph',
    },
    {
      title: 'DepEd LIS Portal',
      desc: 'Access learner registry services',
      category: 'Administrative',
      url: 'https://lis.deped.gov.ph',
    },
    {
      title: 'DepEd EBEIS',
      desc: 'Review school profiles and institutional data',
      category: 'Institutional',
      url: 'https://ebeis.deped.gov.ph',
    },
    {
      title: 'Project KIT Handout',
      desc: 'Open Project KIT user and research documentation',
      category: 'System Guide',
      url: '/docs/PROJECT_KIT_CLIENT_HANDOUT.md',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">
          DepEd Application Hub
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Integrated launchpad for institutional DepEd platforms, national registries, and curriculum resource repositories.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {hubs.map((hub) => (
          <div
            key={hub.title}
            className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-none transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
          >
            <div className="space-y-2">
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                {hub.category}
              </span>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                {hub.title}
              </h3>
              <p className="line-clamp-1 text-xs text-gray-500 leading-relaxed dark:text-gray-400">
                {hub.desc}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
              <a
                href={hub.url}
                target={hub.url.startsWith('http') ? '_blank' : '_self'}
                rel="noreferrer"
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 transition-colors"
              >
                <span>Open portal</span>
                <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
