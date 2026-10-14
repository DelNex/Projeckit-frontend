'use client';

import { useEffect, useState, useMemo } from 'react';
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
}

type ModalActionType =
  | 'approve'
  | 'reject'
  | 'suspend'
  | 'reactivate'
  | 'change_role'
  | 'confirm_email'
  | 'resend_confirmation'
  | 'reset_password';

export default function AllAccountsPage() {
  const { toast } = useToast();

  // Data states
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [stats, setStats] = useState<SummaryStats>({
    total: 0,
    approved: 0,
    pending: 0,
    rejectedSuspended: 0,
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

  // Active user for actions / modals
  const [activeUser, setActiveUser] = useState<AdminUserRecord | null>(null);
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: ModalActionType;
    user: AdminUserRecord | null;
    targetRole?: 'admin' | 'teacher';
  }>({
    isOpen: false,
    type: 'approve',
    user: null,
  });
  const [modalLoading, setModalLoading] = useState(false);

  // Detail Modal State (B5)
  const [detailUser, setDetailUser] = useState<AdminUserRecord | null>(null);

  // Menu popover state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Fetch accounts data from server route
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        search,
        status: statusFilter,
        role: roleFilter,
        school: schoolFilter,
        sortBy,
        sortOrder,
      });

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch user accounts');
      }

      setUsers(data.users || []);
      setStats(data.stats || { total: 0, approved: 0, pending: 0, rejectedSuspended: 0 });
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.totalCount || 0);
      setCallerId(data.caller?.id || null);
      setIsPlatformAdmin(!!data.caller?.isPlatformAdmin);
      setTenantsList(data.tenants || []);
    } catch (err: any) {
      console.error('Failed to load accounts:', err);
      toast.error(friendlyError(err, 'Failed to load accounts. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, statusFilter, roleFilter, schoolFilter, sortBy, sortOrder]);

  // Debounced search trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchUsers();
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Sort handler
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setPage(1);
  };

  // Execute row actions
  const executeModalAction = async () => {
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
        toast.success(`Account successfully ${type === 'approve' ? 'approved' : type === 'reject' ? 'rejected' : type === 'suspend' ? 'suspended' : 'reactivated'}.`);
      } else if (type === 'change_role') {
        const res = await fetch(`/api/admin/users/${user.id}/role`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: targetRole }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update user role.');
        toast.success(`Role updated to ${targetRole?.toUpperCase()} for ${user.display_name}.`);
      } else if (type === 'confirm_email' || type === 'resend_confirmation' || type === 'reset_password') {
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
            Manage institutional user profiles, credentials, role assignments, and authentication status.
          </p>
        </div>
      </div>

      {/* Summary KPI Cards (B3) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Total Accounts</span>
            <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{stats.total}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Approved</span>
            <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{stats.approved}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Pending</span>
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{stats.pending}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">Suspended / Rejected</span>
            <UserX className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{stats.rejectedSuspended}</p>
        </div>
      </div>

      {/* Filter and Search Bar (B3) */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts by name or email..."
            className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-4 py-2 text-xs text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition hover:bg-gray-50 focus:border-blue-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <option value="all">All Statuses</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
            <option value="rejected">Rejected</option>
          </select>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition hover:bg-gray-50 focus:border-blue-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <option value="all">All Roles</option>
            <option value="teacher">Teachers</option>
            <option value="admin">Administrators</option>
          </select>

          {/* School Filter (if platform admin) */}
          {isPlatformAdmin && tenantsList.length > 0 && (
            <select
              value={schoolFilter}
              onChange={(e) => {
                setSchoolFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition hover:bg-gray-50 focus:border-blue-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <option value="all">All Schools</option>
              {tenantsList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || t.code}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Accounts Table Card (B3) */}
      <div className="rounded-2xl sm:rounded-3xl border border-gray-200 bg-white shadow-xs dark:border-gray-800 dark:bg-gray-900 overflow-hidden paint-isolate min-w-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
            <span className="text-xs">Loading faculty accounts...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <Users className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">No accounts match your criteria</p>
            <p className="text-xs text-gray-400 max-w-sm mt-1">
              Try adjusting your search terms, role filters, or status selection.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs table-optimized min-w-[750px]">
              <thead className="border-b border-gray-100 bg-gray-50/50 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-500">
                <tr>
                  <th
                    className="px-4 py-3.5 cursor-pointer select-none hover:text-gray-600 dark:hover:text-gray-300"
                    onClick={() => handleSort('display_name')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Faculty Member</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3.5 cursor-pointer select-none hover:text-gray-600 dark:hover:text-gray-300"
                    onClick={() => handleSort('email')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Email Address</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3.5 cursor-pointer select-none hover:text-gray-600 dark:hover:text-gray-300 text-center"
                    onClick={() => handleSort('role')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Role</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3.5 cursor-pointer select-none hover:text-gray-600 dark:hover:text-gray-300 text-center"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Status</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="px-4 py-3.5 text-center">Email Verified</th>
                  <th
                    className="px-4 py-3.5 cursor-pointer select-none hover:text-gray-600 dark:hover:text-gray-300"
                    onClick={() => handleSort('created_at')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Registered</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="px-4 py-3.5">Last Active</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {users.map((u) => {
                  const isSelf = u.id === callerId;
                  const menuOpen = openMenuId === u.id;

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-gray-50/70 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      {/* Name & School */}
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
                        <div className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span>{u.school}</span>
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
                        {getStatusBadge(u.status)}
                      </td>

                      {/* Email Confirmed */}
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

                      {/* Registered Date */}
                      <td className="px-4 py-3.5 text-gray-500 dark:text-gray-400 text-[11px]">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>

                      {/* Last Sign-in */}
                      <td className="px-4 py-3.5 text-gray-400 text-[11px]">
                        {u.last_sign_in_at
                          ? new Date(u.last_sign_in_at).toLocaleDateString()
                          : 'Never'}
                      </td>

                      {/* Action Menu (B4) */}
                      <td className="px-4 py-3.5 text-right relative">
                        <div className="flex items-center justify-end gap-1">
                          {/* Quick details button */}
                          <button
                            type="button"
                            onClick={() => setDetailUser(u)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition"
                            title="View account metrics & details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {/* Dropdown Menu Trigger */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setOpenMenuId(menuOpen ? null : u.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>

                            {/* Dropdown Menu */}
                            {menuOpen && (
                              <>
                                <div
                                  className="fixed inset-0 z-40"
                                  onClick={() => setOpenMenuId(null)}
                                />
                                <div className="absolute right-0 top-full mt-1 w-52 rounded-2xl border border-gray-200 bg-white py-1.5 shadow-xl dark:border-gray-800 dark:bg-gray-900 z-50 text-left text-xs">
                                  {/* View Details */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setDetailUser(u);
                                    }}
                                    className="flex w-full items-center gap-2 px-3.5 py-2 text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                                  >
                                    <Eye className="h-3.5 w-3.5 text-blue-500" />
                                    <span>View Details &amp; Metrics</span>
                                  </button>

                                  <div className="my-1 border-t border-gray-100 dark:border-gray-800" />

                                  {/* Approve / Reactivate */}
                                  {u.status !== 'approved' && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        setActionModal({
                                          isOpen: true,
                                          type: u.status === 'pending' ? 'approve' : 'reactivate',
                                          user: u,
                                        });
                                      }}
                                      className="flex w-full items-center gap-2 px-3.5 py-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      <span>
                                        {u.status === 'pending' ? 'Approve Account' : 'Reactivate Account'}
                                      </span>
                                    </button>
                                  )}

                                  {/* Reject (Pending Only) */}
                                  {u.status === 'pending' && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        setActionModal({
                                          isOpen: true,
                                          type: 'reject',
                                          user: u,
                                        });
                                      }}
                                      className="flex w-full items-center gap-2 px-3.5 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                      <span>Reject Applicant</span>
                                    </button>
                                  )}

                                  {/* Suspend (Approved Only) */}
                                  {u.status === 'approved' && !isSelf && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        setActionModal({
                                          isOpen: true,
                                          type: 'suspend',
                                          user: u,
                                        });
                                      }}
                                      className="flex w-full items-center gap-2 px-3.5 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                    >
                                      <UserX className="h-3.5 w-3.5" />
                                      <span>Suspend Account</span>
                                    </button>
                                  )}

                                  {/* Change Role */}
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
                                      className="flex w-full items-center gap-2 px-3.5 py-2 text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                                    >
                                      <Shield className="h-3.5 w-3.5 text-purple-500" />
                                      <span>
                                        {u.role === 'admin'
                                          ? 'Demote to Teacher'
                                          : 'Promote to Admin'}
                                      </span>
                                    </button>
                                  )}

                                  <div className="my-1 border-t border-gray-100 dark:border-gray-800" />

                                  {/* Confirm Email Manually */}
                                  {!u.is_email_confirmed && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        setActionModal({
                                          isOpen: true,
                                          type: 'confirm_email',
                                          user: u,
                                        });
                                      }}
                                      className="flex w-full items-center gap-2 px-3.5 py-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                                    >
                                      <Mail className="h-3.5 w-3.5" />
                                      <span>Confirm Email Manually</span>
                                    </button>
                                  )}

                                  {/* Resend Confirmation Email */}
                                  {!u.is_email_confirmed && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        setActionModal({
                                          isOpen: true,
                                          type: 'resend_confirmation',
                                          user: u,
                                        });
                                      }}
                                      className="flex w-full items-center gap-2 px-3.5 py-2 text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                                    >
                                      <Send className="h-3.5 w-3.5 text-blue-500" />
                                      <span>Resend Confirmation</span>
                                    </button>
                                  )}

                                  {/* Send Password Reset Email */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setActionModal({
                                        isOpen: true,
                                        type: 'reset_password',
                                        user: u,
                                      });
                                    }}
                                    className="flex w-full items-center gap-2 px-3.5 py-2 text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                                  >
                                    <KeyRound className="h-3.5 w-3.5 text-amber-500" />
                                    <span>Send Password Reset</span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer (B3) */}
        {!loading && users.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/50 px-4 sm:px-6 py-3.5 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-400">
            <div>
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

      {/* Action Confirmation Modal (B4) */}
      <ConfirmationModal
        isOpen={actionModal.isOpen}
        onClose={() => setActionModal({ isOpen: false, type: 'approve', user: null })}
        onConfirm={executeModalAction}
        isLoading={modalLoading}
        title={
          actionModal.type === 'approve'
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
          actionModal.type === 'approve'
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
          actionModal.type === 'reject' || actionModal.type === 'suspend'
            ? 'reject'
            : actionModal.type === 'approve' || actionModal.type === 'reactivate'
            ? 'restore'
            : 'neutral'
        }
        confirmLabel={
          actionModal.type === 'approve'
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

            {/* Metrics cards (B5) */}
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
    </div>
  );
}

