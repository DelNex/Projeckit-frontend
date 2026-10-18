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

import { useTenant } from '@/context/TenantContext';
import { useEffect, useState } from 'react';

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
  const { tenantName, isLoading: tenantLoading } = useTenant();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    async function checkPlatformAdmin() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('is_platform_admin')
            .eq('id', user.id)
            .maybeSingle();
          if (profile?.is_platform_admin) {
            setIsPlatformAdmin(true);
          }
        }
      } catch {
        // Fallback
      }
    }
    checkPlatformAdmin();
  }, [supabase]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const teacherNavItems = [
    {
      group: 'MAIN',
      items: [
        { name: 'Home', href: '/dashboard', icon: LayoutDashboard },
      ],
    },
    {
      group: 'ACADEMIC WORKFLOW',
      items: [
        { name: 'Table of Specifications', href: '/tos', icon: FileSpreadsheet },
        { name: 'Assessments', href: '/assessments', icon: BookOpen },
        { name: 'Students', href: '/students', icon: Users },
      ],
    },
    {
      group: 'ANALYTICS & REPORTS',
      items: [
        { name: 'Results', href: '/analytics', icon: BarChart3 },
        { name: 'Question Analysis', href: '/analytics?tab=item-analysis', icon: CheckSquare },
        { name: 'Reports', href: '/analytics?tab=reports', icon: FileSpreadsheet },
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
        { name: 'All Accounts', href: '/admin/users', icon: Users },
        { name: 'Pending Approvals', href: '/admin/users/pending', icon: UserCheck },
        { name: 'Audit Logs', href: '/admin/audit', icon: FileText },
        { name: 'App Settings', href: '/admin/settings', icon: Sliders },
        ...(isPlatformAdmin
          ? [{ name: 'School Tenants', href: '/admin/tenants', icon: Building2 }]
          : []),
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
          className="fixed inset-0 z-40 bg-slate-950/45 lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation Drawer */}
      <aside
        id="app-sidebar"
        role={isOpen ? 'dialog' : undefined}
        aria-modal={isOpen ? true : undefined}
        aria-label={isAdminMode ? 'Administration navigation' : 'School navigation'}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[min(84vw,18rem)] flex-col border-r border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:static lg:h-full lg:w-64 lg:shrink-0 lg:translate-x-0 sidebar-transition',
          isOpen ? 'translate-x-0 shadow-2xl lg:shadow-none' : '-translate-x-full'
        )}
      >
        {/* Sidebar Header */}
        <div className="flex min-h-[76px] items-center justify-between border-b border-slate-200 px-5 dark:border-gray-800">
          <Link href={isAdminMode ? '/admin' : '/dashboard'} className="flex items-center gap-3">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg font-bold text-white",
              isAdminMode ? "bg-slate-800" : "bg-blue-700"
            )}>
              {isAdminMode ? <Shield className="h-5 w-5" /> : 'KIT'}
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold text-gray-900 dark:text-white leading-tight">
                {isAdminMode ? 'Admin Console' : 'Project KIT'}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]" title={tenantName || 'Academic Portal'}>
                {tenantLoading ? 'Loading school...' : (tenantName || 'Academic Portal')}
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
        <nav aria-label={isAdminMode ? 'Administration' : 'School navigation'} className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
          {navGroups.map((group) => (
            <div key={group.group}>
              <h3 className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-gray-500">
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
                          'flex min-h-11 items-center gap-3 rounded-lg border-l-2 px-3 text-sm font-medium transition-colors duration-150',
                          isActive
                            ? 'border-blue-700 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-950/50 dark:text-blue-200 font-semibold'
                            : 'border-transparent text-slate-700 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-800'
                        )}
                      >
                        <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500')} />
                        <span className="truncate">{item.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* Help & Session Sign Out */}
          <div className="pt-4 border-t border-slate-200 dark:border-gray-800">
            <h3 className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-gray-500">
              SESSION
            </h3>
            <button
              onClick={handleSignOut}
              className="w-full flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30 transition-colors"
            >
              <LogOut className="h-5 w-5 text-red-500" />
              <span>Sign out</span>
            </button>
          </div>
        </nav>
      </aside>
    </>
  );
}
