'use client';

import { useEffect, useState, useMemo } from 'react';
import { invalidateClientQueryCache } from '@/lib/supabase/client';
import {
  Users,
  UserCheck,
  Clock,
  UserX,
  Search,
  Filter,
  ArrowUpDown,
  MoreVertical,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Shield,
  KeyRound,
  Mail,
  Send,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Building2,
  BookOpen,
  GraduationCap,
  Calendar,
  Sparkles,
  Archive,
  Trash2,
  Lock,
  CheckSquare,
  Square,
  MinusSquare,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';

interface AdminUserRecord {
  id: string;
  display_name: string;
  email: string;
  role: 'admin' | 'teacher';
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  school: string;
  tenant_id: string | null;
  created_at: string;
  archived_at: string | null;
  archived_by: string | null;
  archived_by_name: string | null;
  previous_status: string | null;
  last_sign_in_at: string | null;
  is_email_confirmed: boolean;
  assessment_count: number;
  learner_count: number;
}

interface SummaryStats {
  total: number;
  approved: number;
  pending: number;
  rejectedSuspended: number;
  active?: number;
  archived?: number;
}

type ModalActionType =
  | 'approve'
  | 'reject'
  | 'suspend'
  | 'reactivate'
  | 'change_role'
  | 'confirm_email'
  | 'resend_confirmation'
  | 'reset_password'
  | 'archive'
  | 'restore';

interface DeletionImpactData {
  summary: {
    accountsCount: number;
    totalAssessments: number;
    totalAnswerKeys: number;
    totalScanResults: number;
    totalLearners: number;
  };
  perUser: Array<{
    id: string;
    name: string;
    email: string;
    assessments: number;
    answerKeys: number;
    scanResults: number;
    learners: number;
  }>;
  eligibleTeachers: Array<{
    id: string;
    display_name: string;
    email: string;
    role: string;
  }>;
}

export default function AllAccountsPage() {
  const { toast } = useToast();

  // Tab State: 'active' (default) or 'archived'
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  // Data states
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [stats, setStats] = useState<SummaryStats>({
    total: 0,
    approved: 0,
    pending: 0,
    rejectedSuspended: 0,
    active: 0,
    archived: 0,
  });
  const [loading, setLoading] = useState(true);
  const [callerId, setCallerId] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [tenantsList, setTenantsList] = useState<Array<{ id: string; name: string; code: string | null }>>([]);

  // Filter and search states
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [schoolFilter, setSchoolFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination states
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Selection states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectingAllMatching, setIsSelectingAllMatching] = useState(false);

  // Active user for actions / modals
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: ModalActionType;
    user: AdminUserRecord | null;
    targetRole?: 'admin' | 'teacher';
    bulkIds?: string[];
  }>({
    isOpen: false,
    type: 'approve',
    user: null,
  });
  const [modalLoading, setModalLoading] = useState(false);

  // Detail Modal State (B5)
  const [detailUser, setDetailUser] = useState<AdminUserRecord | null>(null);

  // School Assignment Modal State (D5)
  const [schoolModalUser, setSchoolModalUser] = useState<AdminUserRecord | null>(null);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [savingSchool, setSavingSchool] = useState(false);

  // Permanent Delete Modal State
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    userIds: string[];
    usersList: AdminUserRecord[];
    loadingImpact: boolean;
    impact: DeletionImpactData | null;
    hasCode: boolean;
    isLocked: boolean;
    minutesRemaining?: number;
    choice: 'reassign' | 'delete' | null;
    reassignToUserId: string;
    code: string;
    confirmationPhrase: string;
    deleting: boolean;
    error: string | null;
  }>({
    isOpen: false,
    userIds: [],
    usersList: [],
    loadingImpact: false,
    impact: null,
    hasCode: true,
    isLocked: false,
    choice: null,
    reassignToUserId: '',
    code: '',
    confirmationPhrase: '',
    deleting: false,
    error: null,
  });

  // Error state for API requests
  const [error, setError] = useState<string | null>(null);

  // Menu popover state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Fetch accounts data from server route
  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        tab: activeTab,
        search,
        status: statusFilter,
        role: roleFilter,
        school: schoolFilter,
        sortBy,
        sortOrder,
      });

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.code === 'MISSING_SERVICE_KEY') {
          const msg = 'The server is missing its admin key. Ask the site owner to configure it.';
          setError(msg);
          toast.error(msg);
          return;
        }
        throw new Error(data.error || 'Failed to load user accounts.');
      }

      setUsers(data.users || []);
      setStats(data.stats || { total: 0, approved: 0, pending: 0, rejectedSuspended: 0, active: 0, archived: 0 });
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.totalCount || 0);

      if (data.caller) {
        setCallerId(data.caller.id);
        setIsPlatformAdmin(Boolean(data.caller.isPlatformAdmin));
      }

      if (data.tenants) {
        setTenantsList(data.tenants);
      }
    } catch (err: any) {
      console.error('[fetchUsers error]:', err);
      setError(friendlyError(err, 'Failed to retrieve accounts from server.'));
      toast.error(friendlyError(err, 'Failed to load user accounts.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, activeTab, statusFilter, roleFilter, schoolFilter, sortBy, sortOrder]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSelectedIds(new Set());
      setPage(1);
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Clear selection on tab or filter change
  const handleTabChange = (newTab: 'active' | 'archived') => {
    if (newTab === activeTab) return;
    setActiveTab(newTab);
    setSelectedIds(new Set());
    setPage(1);
  };

  const handleFilterChange = (setter: (val: string) => void, val: string) => {
    setter(val);
    setSelectedIds(new Set());
    setPage(1);
  };

  // Selectable users on current page (Admin cannot select themselves)
  const selectablePageUsers = useMemo(() => {
    return users.filter((u) => u.id !== callerId);
  }, [users, callerId]);

  const isAllPageSelected =
    selectablePageUsers.length > 0 && selectablePageUsers.every((u) => selectedIds.has(u.id));
  const isSomePageSelected =
    selectablePageUsers.some((u) => selectedIds.has(u.id)) && !isAllPageSelected;

  const handleToggleSelectAllPage = () => {
    const next = new Set(selectedIds);
    if (isAllPageSelected) {
      selectablePageUsers.forEach((u) => next.delete(u.id));
    } else {
      selectablePageUsers.forEach((u) => next.add(u.id));
    }
    setSelectedIds(next);
  };

  const handleToggleSelectRow = (id: string) => {
    if (id === callerId) return;
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Select all matching filter across all pages (capped at 500)
  const handleSelectAllMatchingFilter = async () => {
    setIsSelectingAllMatching(true);
    try {
      const params = new URLSearchParams({
        idsOnly: 'true',
        tab: activeTab,
        search,
        status: statusFilter,
        role: roleFilter,
        school: schoolFilter,
      });

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to select matching accounts.');
      }

      const matchingIds: string[] = data.ids || [];
      setSelectedIds(new Set(matchingIds));

      if (data.capped) {
        toast.info('Selected all 500 matching accounts (capped at 500 per bulk action).');
      } else {
        toast.info(`Selected all ${matchingIds.length} accounts matching this filter.`);
      }
    } catch (err: any) {
      toast.error(friendlyError(err, 'Failed to select matching accounts.'));
    } finally {
      setIsSelectingAllMatching(false);
    }
  };

  // Archive Action Execution
  const handleArchiveAccounts = async (userIds: string[]) => {
    setModalLoading(true);
    try {
      const res = await fetch('/api/admin/users/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to archive accounts.');
      }
      invalidateClientQueryCache();

      const count = data.archivedCount || 0;
      const archivedIds: string[] = data.archivedIds || [];

      // Per-account warnings if any failed
      const failed = (data.results || []).filter((r: any) => !r.success);
      if (failed.length > 0) {
        toast.error(`Could not archive ${failed.length} account(s): ${failed.map((f: any) => f.reason).join(', ')}`);
      }

      if (count > 0) {
        // Show 8-second toast with Undo option
        toast.success(
          `Archived ${count} account${count === 1 ? '' : 's'}.`,
          {
            duration: 8000,
            action: {
              label: 'Undo',
              onClick: () => handleUndoArchive(archivedIds),
            },
          }
        );
      }

      setSelectedIds(new Set());
      setActionModal({ isOpen: false, type: 'archive', user: null });
      await fetchUsers();
    } catch (err: any) {
      console.error('[handleArchiveAccounts]:', err);
      toast.error(friendlyError(err, 'Failed to archive selected accounts.'));
    } finally {
      setModalLoading(false);
    }
  };

  // Undo Archive
  const handleUndoArchive = async (userIds: string[]) => {
    try {
      const res = await fetch('/api/admin/users/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to undo archive.');
      }
      invalidateClientQueryCache();

      toast.success(`Restored ${data.restoredCount || userIds.length} account(s).`);
      await fetchUsers();
    } catch (err: any) {
      toast.error(friendlyError(err, 'Failed to restore accounts.'));
    }
  };

  // Restore Action Execution
  const handleRestoreAccounts = async (userIds: string[]) => {
    setModalLoading(true);
    try {
      const res = await fetch('/api/admin/users/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to restore accounts.');
      }
      invalidateClientQueryCache();

      const count = data.restoredCount || 0;
      toast.success(`Successfully restored ${count} account${count === 1 ? '' : 's'}.`);
      setSelectedIds(new Set());
      setActionModal({ isOpen: false, type: 'restore', user: null });
      await fetchUsers();
    } catch (err: any) {
      console.error('[handleRestoreAccounts]:', err);
      toast.error(friendlyError(err, 'Failed to restore selected accounts.'));
    } finally {
      setModalLoading(false);
    }
  };

  // Permanent Delete: Open Modal & Fetch Impact
  const handleOpenPermanentDeleteModal = async (userIds: string[]) => {
    const targetUsers = users.filter((u) => userIds.includes(u.id));
    setDeleteModalState({
      isOpen: true,
      userIds,
      usersList: targetUsers,
      loadingImpact: true,
      impact: null,
      hasCode: true,
      isLocked: false,
      choice: null,
      reassignToUserId: '',
      code: '',
      confirmationPhrase: '',
      deleting: false,
      error: null,
    });

    try {
      // 1. Fetch deletion impact
      const impactRes = await fetch('/api/admin/users/delete/impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds }),
      });
      const impactData = await impactRes.json().catch(() => ({}));

      if (!impactRes.ok) {
        throw new Error(impactData.error || 'Failed to calculate deletion impact.');
      }

      // 2. Fetch deletion code status
      const codeRes = await fetch('/api/admin/deletion-code');
      const codeData = await codeRes.json().catch(() => ({}));

      setDeleteModalState((prev) => ({
        ...prev,
        loadingImpact: false,
        impact: impactData,
        hasCode: Boolean(codeData.hasCode),
        isLocked: Boolean(codeData.isLocked),
        minutesRemaining: codeData.minutesRemaining,
      }));
    } catch (err: any) {
      console.error('[handleOpenPermanentDeleteModal]:', err);
      setDeleteModalState((prev) => ({
        ...prev,
        loadingImpact: false,
        error: friendlyError(err, 'Failed to load account deletion details.'),
      }));
    }
  };

  // Permanent Delete: Execution
  const handleExecutePermanentDelete = async () => {
    const { userIds, choice, reassignToUserId, code, confirmationPhrase } = deleteModalState;

    if (confirmationPhrase !== 'DELETE') {
      setDeleteModalState((prev) => ({
        ...prev,
        error: 'Please type DELETE exactly to confirm permanent deletion.',
      }));
      return;
    }

    if (!choice) {
      setDeleteModalState((prev) => ({
        ...prev,
        error: 'Please select what should happen to the account content.',
      }));
      return;
    }

    if (choice === 'reassign' && !reassignToUserId) {
      setDeleteModalState((prev) => ({
        ...prev,
        error: 'Please select a teacher to reassign content to.',
      }));
      return;
    }

    if (!code) {
      setDeleteModalState((prev) => ({
        ...prev,
        error: 'Please enter the administrative deletion code.',
      }));
      return;
    }

    setDeleteModalState((prev) => ({ ...prev, deleting: true, error: null }));

    try {
      const res = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds,
          choice,
          reassignToUserId: choice === 'reassign' ? reassignToUserId : undefined,
          code,
          confirmationPhrase,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg = data.error || 'Failed to delete accounts.';
        setDeleteModalState((prev) => ({
          ...prev,
          deleting: false,
          error: errorMsg,
          isLocked: Boolean(data.isLocked),
        }));
        toast.error(errorMsg);
        return;
      }

      toast.success(
        `Permanently deleted ${data.deletedCount} account${data.deletedCount === 1 ? '' : 's'}.`
      );

      setDeleteModalState((prev) => ({ ...prev, isOpen: false, deleting: false }));
      setSelectedIds(new Set());
      await fetchUsers();
    } catch (err: any) {
      console.error('[handleExecutePermanentDelete]:', err);
      const friendly = friendlyError(err, 'An error occurred during permanent deletion.');
      setDeleteModalState((prev) => ({ ...prev, deleting: false, error: friendly }));
      toast.error(friendly);
    }
  };

  // General single-user actions
  const executeModalAction = async () => {
    if (actionModal.type === 'archive') {
      const ids = actionModal.bulkIds || (actionModal.user ? [actionModal.user.id] : []);
      await handleArchiveAccounts(ids);
      return;
    }

    if (actionModal.type === 'restore') {
      const ids = actionModal.bulkIds || (actionModal.user ? [actionModal.user.id] : []);
      await handleRestoreAccounts(ids);
      return;
    }

    if (!actionModal.user) return;
    const { type, user, targetRole } = actionModal;
    setModalLoading(true);

    try {
      if (type === 'approve' || type === 'reject' || type === 'suspend' || type === 'reactivate') {
        const res = await fetch(`/api/admin/users/${user.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: type }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to ${type} account.`);
        toast.success(
          `Account successfully ${
            type === 'approve'
              ? 'approved'
              : type === 'reject'
              ? 'rejected'
              : type === 'suspend'
              ? 'suspended'
              : 'reactivated'
          }.`
        );
      } else if (type === 'change_role') {
        const res = await fetch(`/api/admin/users/${user.id}/role`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: targetRole }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update user role.');
        toast.success(`Role updated to ${targetRole?.toUpperCase()} for ${user.display_name}.`);
      } else if (
        type === 'confirm_email' ||
        type === 'resend_confirmation' ||
        type === 'reset_password'
      ) {
        const res = await fetch(`/api/admin/users/${user.id}/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: type }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to perform email action.');
        toast.success(data.message || 'Action completed successfully.');
      }

      setActionModal({ isOpen: false, type: 'approve', user: null });
      await fetchUsers();
    } catch (err: any) {
      console.error(`Action ${type} error:`, err);
      toast.error(friendlyError(err, 'Failed to complete requested action.'));
    } finally {
      setModalLoading(false);
    }
  };

  // Helper for status badge styling
  const getStatusBadge = (status: AdminUserRecord['status']) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Approved
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Pending
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Suspended
          </span>
        );
      case 'rejected':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
            Rejected
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
            All Accounts
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Manage institutional user profiles, credentials, role assignments, archive lifecycles, and permanent deletion.
          </p>
        </div>

        {/* Tab Switcher: Active vs Archived */}
        <div className="inline-flex rounded-2xl bg-gray-100 p-1 dark:bg-gray-800/70">
          <button
            type="button"
            onClick={() => handleTabChange('active')}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition',
              activeTab === 'active'
                ? 'bg-white text-gray-900 shadow-xs dark:bg-gray-900 dark:text-white'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            )}
          >
            <span>Active Accounts</span>
            {stats.active !== undefined && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-extrabold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {stats.active}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('archived')}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition',
              activeTab === 'archived'
                ? 'bg-white text-gray-900 shadow-xs dark:bg-gray-900 dark:text-white'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            )}
          >
            <Archive className="h-3.5 w-3.5" />
            <span>Archived</span>
            {stats.archived !== undefined && (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-extrabold text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                {stats.archived}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Total Accounts</span>
            <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-gray-900 dark:text-white">
            {stats.total}
          </p>
          <span className="text-[11px] text-gray-400">Institutional profiles</span>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-xs dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Approved</span>
            <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {stats.approved}
          </p>
          <span className="text-[11px] text-gray-400">Active teaching faculty</span>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-white p-4 shadow-xs dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Pending</span>
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400">
            {stats.pending}
          </p>
          <span className="text-[11px] text-gray-400">Awaiting verification</span>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              {activeTab === 'active' ? 'Rejected / Suspended' : 'Archived Accounts'}
            </span>
            {activeTab === 'active' ? (
              <UserX className="h-4 w-4 text-rose-500" />
            ) : (
              <Archive className="h-4 w-4 text-amber-500" />
            )}
          </div>
          <p className="mt-2 text-2xl font-black text-gray-900 dark:text-white">
            {activeTab === 'active' ? stats.rejectedSuspended : stats.archived || 0}
          </p>
          <span className="text-[11px] text-gray-400">
            {activeTab === 'active' ? 'Inactive users' : 'Suspended & retrievable'}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search faculty by name or official email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'active' && (
              <select
                value={statusFilter}
                onChange={(e) => handleFilterChange(setStatusFilter, e.target.value)}
                className="h-10 rounded-2xl border border-gray-200 bg-gray-50 px-3 text-xs font-semibold text-gray-700 outline-none focus:border-blue-600 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300"
              >
                <option value="all">All Statuses</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
                <option value="rejected">Rejected</option>
              </select>
            )}

            <select
              value={roleFilter}
              onChange={(e) => handleFilterChange(setRoleFilter, e.target.value)}
              className="h-10 rounded-2xl border border-gray-200 bg-gray-50 px-3 text-xs font-semibold text-gray-700 outline-none focus:border-blue-600 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300"
            >
              <option value="all">All Roles</option>
              <option value="admin">Administrators</option>
              <option value="teacher">Teachers</option>
            </select>

            {isPlatformAdmin && tenantsList.length > 0 && (
              <select
                value={schoolFilter}
                onChange={(e) => handleFilterChange(setSchoolFilter, e.target.value)}
                className="h-10 rounded-2xl border border-gray-200 bg-gray-50 px-3 text-xs font-semibold text-gray-700 outline-none focus:border-blue-600 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300"
              >
                <option value="all">All Schools</option>
                {tenantsList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Bulk Toolbar Banner (Requirement 2) */}
      {selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50/90 p-4 text-xs font-semibold text-blue-900 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/60 dark:text-blue-200">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-xs">
              {selectedIds.size}
            </span>
            <span>
              {selectedIds.size} account{selectedIds.size === 1 ? '' : 's'} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="ml-2 text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
            >
              Clear
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'active' ? (
              <button
                type="button"
                onClick={() =>
                  setActionModal({
                    isOpen: true,
                    type: 'archive',
                    user: null,
                    bulkIds: Array.from(selectedIds),
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-600 transition"
              >
                <Archive className="h-3.5 w-3.5" />
                <span>Archive Selected ({selectedIds.size})</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setActionModal({
                      isOpen: true,
                      type: 'restore',
                      user: null,
                      bulkIds: Array.from(selectedIds),
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Restore Selected ({selectedIds.size})</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenPermanentDeleteModal(Array.from(selectedIds))}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Permanently Delete ({selectedIds.size})</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Select All Across Matching Filter Banner */}
      {isAllPageSelected && totalCount > selectablePageUsers.length && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-300">
          <span>
            All <span className="font-bold">{selectablePageUsers.length}</span> accounts on this page are selected.
          </span>
          <button
            type="button"
            disabled={isSelectingAllMatching}
            onClick={handleSelectAllMatchingFilter}
            className="font-bold text-blue-600 hover:underline dark:text-blue-400 disabled:opacity-50"
          >
            {isSelectingAllMatching ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Selecting...
              </span>
            ) : (
              `Select all ${Math.min(totalCount, 500)} accounts matching this filter`
            )}
          </button>
        </div>
      )}

      {/* Main Table */}
      <div className="rounded-3xl border border-gray-200 bg-white shadow-xs dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
            <p className="text-xs">Loading faculty accounts...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-rose-500">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-rose-500" />
            <p className="font-bold">{error}</p>
            <button
              onClick={() => fetchUsers()}
              className="mt-3 text-blue-600 underline font-semibold"
            >
              Retry
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-xs text-gray-400">
            <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="font-semibold text-gray-600 dark:text-gray-300">
              {activeTab === 'active' ? 'No active accounts found.' : 'No archived accounts.'}
            </p>
            <p className="mt-1 text-gray-400">
              {search ? 'Try adjusting your search criteria.' : 'Accounts will appear here once added.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/75 dark:border-gray-800 dark:bg-gray-800/40 font-bold text-gray-600 dark:text-gray-300">
                  {/* Select All Checkbox */}
                  <th className="py-3 px-3 w-10 text-center">
                    <button
                      type="button"
                      onClick={handleToggleSelectAllPage}
                      className="text-gray-500 hover:text-blue-600 transition"
                      title={isAllPageSelected ? 'Deselect page' : 'Select all on page'}
                    >
                      {isAllPageSelected ? (
                        <CheckSquare className="h-4 w-4 text-blue-600" />
                      ) : isSomePageSelected ? (
                        <MinusSquare className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">Faculty Member</th>
                  <th className="py-3 px-4">Official Email</th>
                  <th className="py-3 px-4 text-center">Role</th>
                  <th className="py-3 px-4 text-center">
                    {activeTab === 'active' ? 'Status' : 'Previous Status'}
                  </th>
                  {activeTab === 'active' ? (
                    <>
                      <th className="py-3 px-4 text-center">Email Confirmed</th>
                      <th className="py-3 px-4">Registered Date</th>
                      <th className="py-3 px-4">Last Sign-in</th>
                    </>
                  ) : (
                    <>
                      <th className="py-3 px-4">Archived Date</th>
                      <th className="py-3 px-4">Archived By</th>
                    </>
                  )}
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                {users.map((u) => {
                  const isSelf = u.id === callerId;
                  const isSelected = selectedIds.has(u.id);
                  const menuOpen = openMenuId === u.id;

                  return (
                    <tr
                      key={u.id}
                      className={cn(
                        'hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition',
                        isSelected && 'bg-blue-50/40 dark:bg-blue-950/20'
                      )}
                    >
                      {/* Checkbox column */}
                      <td className="py-3.5 px-3 text-center">
                        {isSelf ? (
                          <span
                            className="inline-block text-gray-300 dark:text-gray-700 cursor-not-allowed"
                            title="You cannot select your own administrator account"
                          >
                            <Square className="h-4 w-4 opacity-30" />
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleSelectRow(u.id)}
                            className="text-gray-400 hover:text-blue-600 transition"
                          >
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-blue-600" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </td>

                      {/* Faculty Member */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setDetailUser(u)}
                            className="font-bold text-gray-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400 text-left transition"
                          >
                            {u.display_name}
                          </button>
                          {isSelf && (
                            <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] flex items-center gap-1 mt-0.5">
                          {u.tenant_id ? (
                            <span className="text-gray-400 flex items-center gap-1">
                              <Building2 className="h-3 w-3 shrink-0" />
                              <span>{u.school}</span>
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span>No School Assigned</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300 font-mono text-[11px]">
                        {u.email}
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={cn(
                            'rounded-md px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider',
                            u.role === 'admin'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                              : 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                          )}
                        >
                          {u.role}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center">
                        {activeTab === 'active' ? (
                          getStatusBadge(u.status)
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            {u.previous_status || 'approved'}
                          </span>
                        )}
                      </td>

                      {/* Conditional Columns */}
                      {activeTab === 'active' ? (
                        <>
                          <td className="px-4 py-3.5 text-center">
                            {u.is_email_confirmed ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Confirmed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Unconfirmed
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-gray-500 dark:text-gray-400 text-[11px]">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>

                          <td className="px-4 py-3.5 text-gray-400 text-[11px]">
                            {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : 'Never'}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300 text-[11px]">
                            {u.archived_at ? new Date(u.archived_at).toLocaleString() : '—'}
                          </td>
                          <td className="px-4 py-3.5 text-gray-500 dark:text-gray-400 text-[11px]">
                            {u.archived_by_name || 'Administrator'}
                          </td>
                        </>
                      )}

                      {/* Action Menu */}
                      <td className="px-4 py-3.5 text-right relative">
                        <div className="flex items-center justify-end gap-1">
                          {/* Details */}
                          <button
                            type="button"
                            onClick={() => setDetailUser(u)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition"
                            title="View metrics & details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {/* Quick Actions based on tab */}
                          {activeTab === 'archived' ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={isSelf}
                                onClick={() =>
                                  setActionModal({
                                    isOpen: true,
                                    type: 'restore',
                                    user: u,
                                  })
                                }
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-40"
                                title="Restore account"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span>Restore</span>
                              </button>

                              <button
                                type="button"
                                disabled={isSelf}
                                onClick={() => handleOpenPermanentDeleteModal([u.id])}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40"
                                title="Permanently delete account"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          ) : (
                            /* Active Tab Menu */
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setOpenMenuId(menuOpen ? null : u.id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>

                              {menuOpen && (
                                <>
                                  <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setOpenMenuId(null)}
                                  />
                                  <div className="absolute right-0 top-8 z-50 w-52 rounded-2xl border border-gray-100 bg-white py-1.5 shadow-xl dark:border-gray-800 dark:bg-gray-900 text-left">
                                    {/* Approve / Reject */}
                                    {u.status === 'pending' && (
                                      <>
                                        <button
                                          type="button"
                                          disabled={isSelf}
                                          onClick={() => {
                                            setOpenMenuId(null);
                                            setActionModal({ isOpen: true, type: 'approve', user: u });
                                          }}
                                          className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                        >
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          <span>Approve Application</span>
                                        </button>

                                        <button
                                          type="button"
                                          disabled={isSelf}
                                          onClick={() => {
                                            setOpenMenuId(null);
                                            setActionModal({ isOpen: true, type: 'reject', user: u });
                                          }}
                                          className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                        >
                                          <XCircle className="h-3.5 w-3.5" />
                                          <span>Reject Application</span>
                                        </button>
                                      </>
                                    )}

                                    {/* Suspend / Reactivate */}
                                    {u.status === 'approved' && !isSelf && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenMenuId(null);
                                          setActionModal({ isOpen: true, type: 'suspend', user: u });
                                        }}
                                        className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-semibold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                      >
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        <span>Suspend Account</span>
                                      </button>
                                    )}

                                    {u.status === 'suspended' && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenMenuId(null);
                                          setActionModal({ isOpen: true, type: 'reactivate', user: u });
                                        }}
                                        className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        <span>Reactivate Access</span>
                                      </button>
                                    )}

                                    {/* Role toggle */}
                                    {!isSelf && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenMenuId(null);
                                          setActionModal({
                                            isOpen: true,
                                            type: 'change_role',
                                            user: u,
                                            targetRole: u.role === 'admin' ? 'teacher' : 'admin',
                                          });
                                        }}
                                        className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                                      >
                                        <Shield className="h-3.5 w-3.5 text-purple-500" />
                                        <span>
                                          Make {u.role === 'admin' ? 'Teacher' : 'Administrator'}
                                        </span>
                                      </button>
                                    )}

                                    {/* Platform Admin School Assignment */}
                                    {isPlatformAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenMenuId(null);
                                          setSchoolModalUser(u);
                                          setSelectedSchoolId(u.tenant_id || '');
                                        }}
                                        className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                                      >
                                        <Building2 className="h-3.5 w-3.5 text-blue-500" />
                                        <span>Change School</span>
                                      </button>
                                    )}

                                    {/* Email Confirm */}
                                    {!u.is_email_confirmed && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenMenuId(null);
                                          setActionModal({ isOpen: true, type: 'confirm_email', user: u });
                                        }}
                                        className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                                      >
                                        <Mail className="h-3.5 w-3.5 text-blue-500" />
                                        <span>Confirm Email Address</span>
                                      </button>
                                    )}

                                    {/* Archive Account Action */}
                                    {!isSelf && (
                                      <div className="border-t border-gray-100 my-1 dark:border-gray-800">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setOpenMenuId(null);
                                            setActionModal({
                                              isOpen: true,
                                              type: 'archive',
                                              user: u,
                                            });
                                          }}
                                          className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-semibold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                        >
                                          <Archive className="h-3.5 w-3.5" />
                                          <span>Archive Account</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/50 p-4 text-xs dark:border-gray-800 dark:bg-gray-900/50">
            <div className="text-gray-500 dark:text-gray-400">
              Showing <span className="font-bold text-gray-900 dark:text-white">{(page - 1) * pageSize + 1}</span> to{' '}
              <span className="font-bold text-gray-900 dark:text-white">
                {Math.min(page * pageSize, totalCount)}
              </span>{' '}
              of <span className="font-bold text-gray-900 dark:text-white">{totalCount}</span> faculty accounts
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              <span className="font-bold text-gray-700 dark:text-gray-300 px-2">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal for General & Archive/Restore Actions */}
      <ConfirmationModal
        isOpen={actionModal.isOpen}
        onClose={() => setActionModal({ isOpen: false, type: 'approve', user: null })}
        onConfirm={executeModalAction}
        isLoading={modalLoading}
        title={
          actionModal.type === 'archive'
            ? actionModal.bulkIds && actionModal.bulkIds.length > 1
              ? `Archive ${actionModal.bulkIds.length} Accounts?`
              : `Archive Account for ${actionModal.user?.display_name}?`
            : actionModal.type === 'restore'
            ? actionModal.bulkIds && actionModal.bulkIds.length > 1
              ? `Restore ${actionModal.bulkIds.length} Accounts?`
              : `Restore Account for ${actionModal.user?.display_name}?`
            : actionModal.type === 'approve'
            ? 'Approve Faculty Member?'
            : actionModal.type === 'reject'
            ? 'Reject Faculty Application?'
            : actionModal.type === 'suspend'
            ? 'Suspend User Account?'
            : actionModal.type === 'reactivate'
            ? 'Reactivate User Account?'
            : actionModal.type === 'change_role'
            ? `Change Role to ${actionModal.targetRole?.toUpperCase()}?`
            : actionModal.type === 'confirm_email'
            ? 'Manually Confirm Email?'
            : actionModal.type === 'resend_confirmation'
            ? 'Resend Confirmation Email?'
            : 'Send Password Reset Email?'
        }
        description={
          actionModal.type === 'archive'
            ? actionModal.bulkIds && actionModal.bulkIds.length > 1
              ? `Are you sure you want to archive ${actionModal.bulkIds.length} accounts? Archived users will be suspended and logged out immediately, but their records and assessments remain safe and can be restored at any time.`
              : `Are you sure you want to archive ${actionModal.user?.display_name}? The user will be signed out and unable to log in, but no data will be erased and an administrator can restore them at any time.`
            : actionModal.type === 'restore'
            ? actionModal.bulkIds && actionModal.bulkIds.length > 1
              ? `Are you sure you want to restore ${actionModal.bulkIds.length} accounts back to active status?`
              : `Are you sure you want to restore ${actionModal.user?.display_name}? They will return to their previous status (${actionModal.user?.previous_status || 'approved'}) and can log in immediately.`
            : actionModal.type === 'approve'
            ? `Are you sure you want to approve ${actionModal.user?.display_name || actionModal.user?.email}? They will gain immediate access to institutional assessment data and their email will be confirmed.`
            : actionModal.type === 'reject'
            ? `Are you sure you want to reject the application for ${actionModal.user?.display_name || actionModal.user?.email}? They will not be able to log in.`
            : actionModal.type === 'suspend'
            ? `Are you sure you want to suspend ${actionModal.user?.display_name}? Their active sessions will be terminated and login access revoked.`
            : actionModal.type === 'reactivate'
            ? `Are you sure you want to reactivate access for ${actionModal.user?.display_name}?`
            : actionModal.type === 'change_role'
            ? `Are you sure you want to change ${actionModal.user?.display_name}'s role from ${actionModal.user?.role.toUpperCase()} to ${actionModal.targetRole?.toUpperCase()}?`
            : actionModal.type === 'confirm_email'
            ? `This will mark ${actionModal.user?.email} as confirmed in Supabase Auth, allowing the user to log in immediately.`
            : actionModal.type === 'resend_confirmation'
            ? `Dispatches a fresh signup confirmation link to ${actionModal.user?.email}.`
            : `Sends an official password recovery link to ${actionModal.user?.email}.`
        }
        actionType={
          actionModal.type === 'archive'
            ? 'archive'
            : actionModal.type === 'restore'
            ? 'restore'
            : actionModal.type === 'reject' || actionModal.type === 'suspend'
            ? 'reject'
            : 'neutral'
        }
        confirmLabel={
          actionModal.type === 'archive'
            ? 'Archive Account'
            : actionModal.type === 'restore'
            ? 'Restore Account'
            : actionModal.type === 'approve'
            ? 'Approve'
            : actionModal.type === 'reject'
            ? 'Reject Application'
            : actionModal.type === 'suspend'
            ? 'Suspend Account'
            : actionModal.type === 'reactivate'
            ? 'Reactivate'
            : actionModal.type === 'change_role'
            ? 'Update Role'
            : actionModal.type === 'confirm_email'
            ? 'Confirm Email'
            : actionModal.type === 'resend_confirmation'
            ? 'Resend Email'
            : 'Send Reset Link'
        }
      />

      {/* Permanent Deletion Impact & Confirmation Modal (Requirement 6) */}
      {deleteModalState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl dark:border-rose-900/60 dark:bg-gray-900 space-y-5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    Permanent Account Deletion
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Deleting {deleteModalState.userIds.length} archived account{deleteModalState.userIds.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={deleteModalState.deleting}
                onClick={() => setDeleteModalState((prev) => ({ ...prev, isOpen: false }))}
                className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {deleteModalState.loadingImpact ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin text-rose-600 mb-2" />
                <p className="text-xs">Calculating account impact metrics...</p>
              </div>
            ) : (
              <>
                {/* Deletion Code Warning if Missing or Locked */}
                {!deleteModalState.hasCode && (
                  <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300">
                    <Lock className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>Set a deletion code in Admin Settings first before deleting accounts.</span>
                  </div>
                )}

                {deleteModalState.isLocked && (
                  <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
                    <Lock className="h-4 w-4 shrink-0 text-rose-600" />
                    <span>
                      Deletion action is locked due to 5 failed attempts. Please wait {deleteModalState.minutesRemaining || 15} minutes.
                    </span>
                  </div>
                )}

                {/* Error Banner */}
                {deleteModalState.error && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                    {deleteModalState.error}
                  </div>
                )}

                {/* Impact Metrics Summary */}
                {deleteModalState.impact && (
                  <div>
                    <span className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                      Associated Content &amp; Impact
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-2.5 text-center dark:border-gray-800 dark:bg-gray-800/40">
                        <span className="block text-lg font-black text-gray-900 dark:text-white">
                          {deleteModalState.impact.summary.totalAssessments}
                        </span>
                        <span className="text-[10px] text-gray-500">Assessments</span>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-2.5 text-center dark:border-gray-800 dark:bg-gray-800/40">
                        <span className="block text-lg font-black text-gray-900 dark:text-white">
                          {deleteModalState.impact.summary.totalAnswerKeys}
                        </span>
                        <span className="text-[10px] text-gray-500">Answer Keys</span>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-2.5 text-center dark:border-gray-800 dark:bg-gray-800/40">
                        <span className="block text-lg font-black text-gray-900 dark:text-white">
                          {deleteModalState.impact.summary.totalScanResults}
                        </span>
                        <span className="text-[10px] text-gray-500">Scan Results</span>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-2.5 text-center dark:border-gray-800 dark:bg-gray-800/40">
                        <span className="block text-lg font-black text-gray-900 dark:text-white">
                          {deleteModalState.impact.summary.totalLearners}
                        </span>
                        <span className="text-[10px] text-gray-500">Learners</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Content Handling Choice (Required) */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-800 dark:text-gray-200">
                    Content Reassignment or Removal <span className="text-rose-500">*</span>
                  </label>

                  <div className="space-y-2">
                    <label className="flex items-start gap-2.5 rounded-xl border border-gray-200 p-3 cursor-pointer hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50">
                      <input
                        type="radio"
                        name="deleteChoice"
                        checked={deleteModalState.choice === 'reassign'}
                        onChange={() =>
                          setDeleteModalState((prev) => ({
                            ...prev,
                            choice: 'reassign',
                            error: null,
                          }))
                        }
                        className="mt-0.5 text-rose-600 focus:ring-rose-500"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-gray-900 dark:text-white block">
                          Reassign their content to another teacher
                        </span>
                        <span className="text-gray-500 text-[11px]">
                          Assessments, answer keys, and modules will be safely transferred to another active faculty member.
                        </span>
                      </div>
                    </label>

                    {deleteModalState.choice === 'reassign' && (
                      <div className="pl-6 pt-1">
                        <select
                          value={deleteModalState.reassignToUserId}
                          onChange={(e) =>
                            setDeleteModalState((prev) => ({
                              ...prev,
                              reassignToUserId: e.target.value,
                              error: null,
                            }))
                          }
                          className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                        >
                          <option value="">Select target faculty member...</option>
                          {deleteModalState.impact?.eligibleTeachers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.display_name} ({t.email}) — {t.role.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <label className="flex items-start gap-2.5 rounded-xl border border-gray-200 p-3 cursor-pointer hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50">
                      <input
                        type="radio"
                        name="deleteChoice"
                        checked={deleteModalState.choice === 'delete'}
                        onChange={() =>
                          setDeleteModalState((prev) => ({
                            ...prev,
                            choice: 'delete',
                            reassignToUserId: '',
                            error: null,
                          }))
                        }
                        className="mt-0.5 text-rose-600 focus:ring-rose-500"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-rose-600 dark:text-rose-400 block">
                          Delete their content too
                        </span>
                        <span className="text-gray-500 text-[11px]">
                          Permanently erases all assessments, answer keys, and grading history created by these accounts.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Deletion Code Input */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Administrative Deletion Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={deleteModalState.code}
                    onChange={(e) =>
                      setDeleteModalState((prev) => ({ ...prev, code: e.target.value, error: null }))
                    }
                    placeholder="Enter school deletion code"
                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 text-xs text-gray-900 outline-none focus:border-rose-600 dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                {/* Confirmation Phrase */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Type <span className="font-mono text-rose-600 font-bold">DELETE</span> to confirm{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={deleteModalState.confirmationPhrase}
                    onChange={(e) =>
                      setDeleteModalState((prev) => ({
                        ...prev,
                        confirmationPhrase: e.target.value,
                        error: null,
                      }))
                    }
                    placeholder="DELETE"
                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 text-xs font-mono text-gray-900 outline-none focus:border-rose-600 dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                {/* Buttons */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    disabled={deleteModalState.deleting}
                    onClick={() => setDeleteModalState((prev) => ({ ...prev, isOpen: false }))}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={
                      deleteModalState.deleting ||
                      !deleteModalState.hasCode ||
                      deleteModalState.isLocked ||
                      !deleteModalState.choice ||
                      (deleteModalState.choice === 'reassign' && !deleteModalState.reassignToUserId) ||
                      !deleteModalState.code ||
                      deleteModalState.confirmationPhrase !== 'DELETE'
                    }
                    onClick={handleExecutePermanentDelete}
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 transition disabled:opacity-50"
                  >
                    {deleteModalState.deleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    <span>Permanently Delete</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Account Details Modal (B5) */}
      {detailUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900 paint-isolate">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 font-bold">
                  {detailUser.display_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    {detailUser.display_name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                    {detailUser.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailUser(null)}
                className="rounded-xl p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {/* Metrics cards */}
            <div className="grid grid-cols-2 gap-3 my-5">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
                  <GraduationCap className="h-4 w-4" />
                  <span>Learners Taught</span>
                </div>
                <p className="mt-2 text-2xl font-black text-gray-900 dark:text-white">
                  {detailUser.learner_count}
                </p>
                <span className="text-[11px] text-gray-400">Enrolled active learners</span>
              </div>

              <div className="rounded-2xl border border-purple-100 bg-purple-50/50 p-4 dark:border-purple-900/50 dark:bg-purple-950/20">
                <div className="flex items-center gap-2 text-xs font-semibold text-purple-700 dark:text-purple-300">
                  <BookOpen className="h-4 w-4" />
                  <span>Assessments</span>
                </div>
                <p className="mt-2 text-2xl font-black text-gray-900 dark:text-white">
                  {detailUser.assessment_count}
                </p>
                <span className="text-[11px] text-gray-400">Created quarterly tests</span>
              </div>
            </div>

            {/* Account Details Summary */}
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
                <span className="text-gray-500 dark:text-gray-400">Status</span>
                <span>{getStatusBadge(detailUser.status)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
                <span className="text-gray-500 dark:text-gray-400">Role</span>
                <span className="font-mono font-bold uppercase text-gray-900 dark:text-white">
                  {detailUser.role}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
                <span className="text-gray-500 dark:text-gray-400">School Tenant</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {detailUser.school}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
                <span className="text-gray-500 dark:text-gray-400">Email Confirmed</span>
                <span className="font-semibold">
                  {detailUser.is_email_confirmed ? (
                    <span className="text-emerald-600 dark:text-emerald-400">Yes</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">No (Pending confirmation)</span>
                  )}
                </span>
              </div>
              {detailUser.archived_at && (
                <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-gray-500 dark:text-gray-400">Archived On</span>
                  <span className="text-rose-600 dark:text-rose-400 font-semibold">
                    {new Date(detailUser.archived_at).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
                <span className="text-gray-500 dark:text-gray-400">Registered On</span>
                <span className="text-gray-900 dark:text-white">
                  {new Date(detailUser.created_at).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-gray-500 dark:text-gray-400">Last Sign In</span>
                <span className="text-gray-900 dark:text-white">
                  {detailUser.last_sign_in_at
                    ? new Date(detailUser.last_sign_in_at).toLocaleString()
                    : 'No sign-in recorded'}
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setDetailUser(null)}
                className="rounded-xl bg-gray-100 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* School Assignment Modal (Platform Admin Only - D5) */}
      {schoolModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {schoolModalUser.tenant_id ? 'Change School Assignment' : 'Assign School'}
              </h3>
              <button
                onClick={() => setSchoolModalUser(null)}
                className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs">
              <div>
                <span className="text-gray-500">Account: </span>
                <span className="font-bold text-gray-900 dark:text-white">{schoolModalUser.display_name}</span>
                <span className="text-gray-400 ml-1">({schoolModalUser.email})</span>
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Select School Organization
                </label>
                <select
                  value={selectedSchoolId}
                  onChange={(e) => setSelectedSchoolId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
                >
                  <option value="">No School Assigned (Unlink)</option>
                  {tenantsList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.code ? `(${t.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setSchoolModalUser(null)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingSchool}
                  onClick={async () => {
                    setSavingSchool(true);
                    try {
                      const res = await fetch(`/api/admin/users/${schoolModalUser.id}/school`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tenant_id: selectedSchoolId || null }),
                      });
                      const resData = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        toast.error(resData.error || 'Failed to update school assignment.');
                        return;
                      }
                      toast.success('School assignment updated successfully.');
                      setSchoolModalUser(null);
                      await fetchUsers();
                    } catch (err: any) {
                      console.error('Failed to change school:', err);
                      toast.error(friendlyError(err, 'Failed to update school.'));
                    } finally {
                      setSavingSchool(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingSchool && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Save Assignment</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
