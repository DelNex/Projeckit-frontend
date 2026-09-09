'use client';

import { ExternalLink } from 'lucide-react';

export default function AppHubPage() {
  const hubs = [
    {
      title: 'DepEd LRMDS',
      desc: 'Learning Resources Management and Development System',
      category: 'Instructional',
      url: 'https://lrmds.deped.gov.ph',
    },
    {
      title: 'DepEd LIS Portal',
      desc: 'Learner Information System National Registry of Learners',
      category: 'Administrative',
      url: 'https://lis.deped.gov.ph',
    },
    {
      title: 'DepEd EBEIS',
      desc: 'Enhanced Basic Education Information System School Profiles',
      category: 'Institutional',
      url: 'https://ebeis.deped.gov.ph',
    },
    {
      title: 'Project KIT Handout',
      desc: 'Authoritative Client & Research Defense Documentation',
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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {hubs.map((hub) => (
          <div
            key={hub.title}
            className="flex flex-col justify-between rounded-3xl border border-gray-200 bg-white p-6 shadow-xs transition hover:border-blue-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-900/60"
          >
            <div className="space-y-2">
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                {hub.category}
              </span>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                {hub.title}
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                {hub.desc}
              </p>
            </div>

            <div className="mt-6 pt-3 border-t border-gray-100 dark:border-gray-800">
              <a
                href={hub.url}
                target={hub.url.startsWith('http') ? '_blank' : '_self'}
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 transition"
              >
                <span>Launch Portal</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
