'use client';

import { AiCopilotModal } from '@/components/ai/AiCopilotModal';
import { createClient } from '@/lib/supabase/client';
import {
    ChevronDown,
    LogOut,
    Menu,
    Settings,
    Sparkles,
    User,
} from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTenant } from '@/context/TenantContext';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  onToggleSidebar: () => void;
  sidebarOpen?: boolean;
  title?: string;
}

export function Header({ onToggleSidebar, sidebarOpen = false, title }: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const pathname = usePathname();
  const { tenantName, userDisplayName, userRole, userEmail } = useTenant();
  const supabase = createClient();

  // Global keyboard shortcut: Ctrl+J or Cmd+J to toggle AI Copilot
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        setIsAiModalOpen((prev) => !prev);
      }
      if (e.key === 'Escape') setDropdownOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const initial = userDisplayName ? userDisplayName.charAt(0).toUpperCase() : 'U';
  const routeTitle = ({
    '/dashboard': 'School dashboard',
    '/tos': 'Table of Specifications',
    '/assessments': 'Item Analysis',
    '/reports': 'Print & Reports',
    '/students': 'Learners',
    '/analytics': 'Performance and reports',
    '/settings/school': 'School settings',
    '/settings/profile': 'Profile settings',
    '/admin': 'Administration',
    '/admin/users': 'User accounts',
    '/admin/users/pending': 'Pending approvals',
    '/admin/tenants': 'School tenants',
    '/admin/audit': 'Audit log',
    '/admin/settings': 'App settings',
    '/app-hub': 'App hub',
  } as Record<string, string>)[pathname];
  const pageTitle = title || routeTitle || (
    pathname.startsWith('/assessments/') ? 'Assessment workspace' :
    pathname.startsWith('/admin/') ? 'Administration' : 'Project KIT'
  );

  return (
    <>
      <header className="sticky top-0 z-40 flex min-h-16 w-full min-w-0 items-center justify-between border-b border-slate-200 bg-white px-3 sm:min-h-[72px] sm:px-6 dark:border-gray-800 dark:bg-gray-900">
        {/* Left: Mobile Toggle & Page Title */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <button
            onClick={onToggleSidebar}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 lg:hidden dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label="Toggle Navigation"
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Project KIT</p>
            <h1 className="truncate text-sm font-semibold text-slate-900 sm:text-base dark:text-white max-w-[180px] sm:max-w-none">
              {pageTitle}
            </h1>
          </div>
        </div>

        {/* Right: AI Copilot, Theme Toggle, Profile Menu */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {/* AI Copilot Launcher Button */}
          <button
            onClick={() => setIsAiModalOpen(true)}
            className="relative flex h-10 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 sm:px-3 text-xs font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70 transition"
            title="Open AI Copilot (Ctrl + J)"
          >
            <Sparkles className="h-4 w-4 text-blue-700 dark:text-blue-300" />
            <span className="hidden sm:inline">AI Copilot</span>
            <kbd className="hidden lg:inline-flex rounded bg-blue-100/70 px-1.5 py-0.5 text-[9px] font-mono text-blue-600 dark:bg-blue-900/60 dark:text-blue-300">
              Ctrl+J
            </kbd>
          </button>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              aria-expanded={dropdownOpen}
              aria-haspopup="menu"
              className="flex min-h-10 items-center gap-1.5 sm:gap-2.5 rounded-lg border border-slate-200 bg-white p-1 sm:p-1.5 sm:pr-3 hover:bg-slate-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
            >
              <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-xs font-bold text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">
                {initial}
              </div>
              <div className="hidden text-left sm:block">
                <p className="truncate max-w-[120px] text-xs font-semibold text-gray-900 dark:text-white leading-tight">
                  {userDisplayName || 'Account'}
                </p>
                <p className="text-[11px] text-gray-400 leading-tight truncate max-w-[120px]" title={tenantName}>
                  {tenantName || (userRole ? userRole.toUpperCase() : 'Teacher')}
                </p>
              </div>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setDropdownOpen(false)}
                />
                <div role="menu" className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-gray-800 dark:bg-gray-900 z-50">
                  <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 mb-1 sm:hidden">
                    <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                      {userDisplayName || 'Account'}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {userEmail}
                    </p>
                  </div>
                  <Link
                    href="/settings/profile"
                    role="menuitem"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <User className="h-4 w-4 text-gray-400" />
                    <span>Profile Settings</span>
                  </Link>
                  <Link
                    href="/settings/school"
                    role="menuitem"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <Settings className="h-4 w-4 text-gray-400" />
                    <span>School Settings</span>
                  </Link>
                  <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                  <button
                    onClick={handleSignOut}
                    role="menuitem"
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <LogOut className="h-4 w-4 text-red-500" />
                    <span>Sign out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Global AI Copilot Modal */}
      <Suspense fallback={null}>
        <AiCopilotModal
          isOpen={isAiModalOpen}
          onClose={() => setIsAiModalOpen(false)}
        />
      </Suspense>
    </>
  );
}
