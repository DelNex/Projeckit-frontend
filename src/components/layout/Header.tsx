'use client';

import { AiCopilotModal } from '@/components/ai/AiCopilotModal';
import { createClient } from '@/lib/supabase/client';
import {
    ChevronDown,
    LogOut,
    Menu,
    Search,
    Settings,
    Sparkles,
    User,
} from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  onToggleSidebar: () => void;
  title?: string;
}

export function Header({ onToggleSidebar, title }: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<{ displayName: string; role: string; email: string } | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, role, email')
            .eq('id', user.id)
            .maybeSingle();

          setUserProfile({
            displayName: profile?.display_name || user.email?.split('@')[0] || 'User',
            role: (profile?.role || 'teacher').toUpperCase(),
            email: user.email || '',
          });
        }
      } catch (err) {
        // Fallback gracefully
      }
    }
    loadProfile();
  }, [supabase]);

  // Global keyboard shortcut: Ctrl+J or Cmd+J to toggle AI Copilot
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        setIsAiModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const initial = userProfile?.displayName ? userProfile.displayName.charAt(0).toUpperCase() : 'U';

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 sm:h-18 w-full min-w-0 items-center justify-between border-b border-gray-200 bg-white/95 px-3 sm:px-6 backdrop-blur-xs dark:border-gray-800 dark:bg-gray-900/95">
        {/* Left: Mobile Toggle & Page Title */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <button
            onClick={onToggleSidebar}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 lg:hidden dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label="Toggle Navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          {title && (
            <h1 className="truncate text-sm sm:text-lg font-bold text-gray-900 dark:text-white max-w-[150px] xs:max-w-[220px] sm:max-w-none">
              {title}
            </h1>
          )}
        </div>

        {/* Right: Quick Search, AI Copilot, Theme Toggle, Profile Menu */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {/* Search input placeholder */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Quick search... (Ctrl + K)"
              className="h-9.5 w-48 lg:w-64 rounded-xl border border-gray-200 bg-gray-50/80 pl-10 pr-4 text-xs text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-200 dark:focus:border-blue-500 dark:focus:bg-gray-800/60"
            />
          </div>

          {/* AI Copilot Launcher Button */}
          <button
            onClick={() => setIsAiModalOpen(true)}
            className="relative flex h-9.5 items-center gap-1.5 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-3 text-xs font-bold text-blue-700 shadow-2xs hover:border-blue-300 hover:from-blue-100 hover:to-indigo-100 dark:border-blue-900/50 dark:from-blue-950/40 dark:to-indigo-950/40 dark:text-blue-300 dark:hover:border-blue-800 transition group"
            title="Open AI Copilot (Ctrl + J)"
          >
            <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform" />
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
              className="flex items-center gap-1.5 sm:gap-2.5 rounded-xl border border-gray-200 bg-white p-1 sm:p-1.5 sm:pr-3 shadow-2xs hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800/80"
            >
              <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-xs font-bold text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">
                {initial}
              </div>
              <div className="hidden text-left sm:block">
                <p className="truncate max-w-[120px] text-xs font-semibold text-gray-900 dark:text-white leading-tight">
                  {userProfile?.displayName || 'Account'}
                </p>
                <p className="text-[11px] text-gray-400 leading-tight">
                  {userProfile?.role || 'Teacher'}
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
                <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-gray-800 dark:bg-gray-900 z-50">
                  <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 mb-1 sm:hidden">
                    <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                      {userProfile?.displayName || 'Account'}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {userProfile?.email}
                    </p>
                  </div>
                  <Link
                    href="/settings/profile"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <User className="h-4 w-4 text-gray-400" />
                    <span>Profile Settings</span>
                  </Link>
                  <Link
                    href="/settings/school"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <Settings className="h-4 w-4 text-gray-400" />
                    <span>School Settings</span>
                  </Link>
                  <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                  <button
                    onClick={handleSignOut}
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
