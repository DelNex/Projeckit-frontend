'use client';

import { Header } from '@/components/layout/Header';
import { AppFooter } from '@/components/layout/AppFooter';
import { Sidebar } from '@/components/layout/Sidebar';
import { Suspense, useState } from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen h-dvh w-full min-w-0 overflow-hidden bg-slate-50 dark:bg-gray-950">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-blue-800 focus:shadow-lg">Skip to main content</a>
      {/* Persistent / Mobile Sidebar */}
      <Suspense fallback={null}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isAdminMode={false}
        />
      </Suspense>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
        <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} sidebarOpen={sidebarOpen} />
        <main id="main-content" tabIndex={-1} className="flex-1 w-full min-w-0 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6 xl:px-8">
          <div className="mx-auto flex min-h-full w-full max-w-[1440px] min-w-0 flex-col">
            <div className="w-full flex-1">{children}</div>
            <AppFooter />
          </div>
        </main>
      </div>
    </div>
  );
}
