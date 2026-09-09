'use client';

import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  BookOpen,
  Building2,
  CheckSquare,
  FileSpreadsheet,
  FileText,
  Grid,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  Sliders,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isAdminMode?: boolean;
}

export function Sidebar({ isOpen, onClose, isAdminMode = false }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams ? searchParams.get('tab') : null;
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const teacherNavItems = [
    {
      group: 'MAIN',
      items: [
        { name: 'Executive Dashboard', href: '/dashboard', icon: LayoutDashboard },
      ],
    },
    {
      group: 'ACADEMIC WORKFLOW',
      items: [
        { name: 'Assessments Workspace', href: '/assessments', icon: BookOpen },
        { name: 'Learners Roster', href: '/students', icon: Users },
      ],
    },
    {
      group: 'ANALYTICS & REPORTS',
      items: [
        { name: 'Performance Analytics', href: '/analytics', icon: BarChart3 },
        { name: 'Item Analysis Table', href: '/analytics?tab=item-analysis', icon: CheckSquare },
        { name: 'Consolidated Reports', href: '/analytics?tab=reports', icon: FileSpreadsheet },
      ],
    },
    {
      group: 'SETTINGS',
      items: [
        { name: 'School Settings', href: '/settings/school', icon: Settings },
      ],
    },
  ];

  const adminNavItems = [
    {
      group: 'ADMINISTRATION',
      items: [
        { name: 'Console Overview', href: '/admin', icon: Shield },
        { name: 'Pending Approvals', href: '/admin/users/pending', icon: UserCheck },
        { name: 'Audit Logs', href: '/admin/audit', icon: FileText },
        { name: 'App Settings', href: '/admin/settings', icon: Sliders },
        { name: 'School Tenants', href: '/admin/tenants', icon: Building2 },
        { name: 'App Hub', href: '/app-hub', icon: Grid },
      ],
    },
    {
      group: 'SWITCH CONTEXT',
      items: [
        { name: 'Teacher Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { name: 'Assessments', href: '/assessments', icon: BookOpen },
      ],
    },
  ];

  const navGroups = isAdminMode ? adminNavItems : teacherNavItems;

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation Drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:static lg:translate-x-0 sidebar-transition',
          isOpen ? 'translate-x-0 shadow-2xl lg:shadow-none' : '-translate-x-full'
        )}
      >
        {/* Sidebar Header */}
        <div className="flex h-18 items-center justify-between border-b border-gray-100 px-6 dark:border-gray-800/80">
          <Link href={isAdminMode ? '/admin' : '/dashboard'} className="flex items-center gap-3">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl font-bold text-white shadow-xs",
              isAdminMode ? "bg-gradient-to-br from-indigo-500 to-purple-600" : "bg-blue-600"
            )}>
              {isAdminMode ? <Shield className="h-5 w-5" /> : 'KIT'}
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold text-gray-900 dark:text-white leading-tight">
                {isAdminMode ? 'Admin Console' : 'Project KIT'}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Capas Senior High
              </span>
            </div>
          </Link>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden dark:hover:bg-gray-800"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          {navGroups.map((group) => (
            <div key={group.group}>
              <h3 className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {group.group}
              </h3>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  let isActive = false;
                  if (item.href.includes('?tab=')) {
                    const tabParam = item.href.split('?tab=')[1];
                    isActive = pathname === '/analytics' && currentTab === tabParam;
                  } else if (item.href === '/analytics') {
                    isActive = pathname === '/analytics' && (!currentTab || currentTab === 'overview');
                  } else {
                    isActive = pathname === item.href || (item.href !== '/dashboard' && item.href !== '/admin' && pathname.startsWith(item.href));
                  }

                  const Icon = item.icon;

                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        onClick={() => {
                          if (window.innerWidth < 1024) onClose();
                        }}
                        className={cn(
                          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.98]',
                          isActive
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-semibold shadow-2xs'
                            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/60'
                        )}
                      >
                        <Icon className={cn('h-5 w-5 shrink-0', isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400')} />
                        <span className="truncate">{item.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* Help & Session Sign Out */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-800/80">
            <h3 className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              SESSION
            </h3>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors"
            >
              <LogOut className="h-5 w-5 text-red-500" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
