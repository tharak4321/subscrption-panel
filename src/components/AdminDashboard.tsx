import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  CreditCard,
  Download,
  Upload,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Lock,
  LogOut,
  RefreshCw,
  Eye,
  Edit2,
  AlertTriangle,
  Server,
  FileText,
  Copy,
  Check,
  QrCode,
  Trash2,
  UserX,
  UserCheck,
  Image as ImageIcon,
} from 'lucide-react';
import { Subscriber, PaymentSubmission, PlanType, SubscriptionStatus, AuditLog } from '../types.js';
import { DatePickerField } from './DatePickerField.js';
import { toYMDString } from '../lib/dateUtils.js';
import {
  adminLogin,
  checkAdminSession,
  adminLogout,
  clearAdminToken,
  setAdminToken,
  getAdminToken,
  fetchAdminSubscribers,
  fetchAdminPayments,
  upsertAdminSubscriber,
  deleteAdminSubscriber,
  deactivateAdminSubscriber,
  activateAdminSubscriber,
  approvePaymentAdmin,
  rejectPaymentAdmin,
  updateQrConfig,
  removeCustomQr,
  fetchAppConfig,
  getTelegramUrl,
  getTelegramDisplay,
  fetchAuditLogs,
  checkDatabaseStatus,
} from '../lib/api.js';
import { InspectProofModal } from './InspectProofModal.js';
import { CsvImportModal } from './CsvImportModal.js';
import { SchemaViewModal } from './SchemaViewModal.js';

interface AdminDashboardProps {
  onBackToPortal: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  adminContactTelegram: string;
  onConfigUpdated?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onBackToPortal,
  showToast,
  adminContactTelegram,
  onConfigUpdated,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [password, setPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSavingSubscriber, setIsSavingSubscriber] = useState(false);

  // Data states
  const [activeTab, setActiveTab] = useState<'subscribers' | 'payments' | 'qr_config' | 'system' | 'audit'>('subscribers');
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [payments, setPayments] = useState<PaymentSubmission[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Database Readiness states
  const [dbStatus, setDbStatus] = useState<'connected' | 'schema_missing' | 'unconfigured' | 'local_dev'>('connected');
  const [dbStatusMessage, setDbStatusMessage] = useState('');
  const [isRecheckingDb, setIsRecheckingDb] = useState(false);
  const [showSchemaModal, setShowSchemaModal] = useState(false);

  // QR & Payment Config states
  const [portalUpiId, setPortalUpiId] = useState('tharak4321@slc');
  const [portalPayeeName, setPortalPayeeName] = useState('Actorsparadise');
  const [customQrImage, setCustomQrImage] = useState<string | null>(null);
  const [qrInstructions, setQrInstructions] = useState('');
  const [uploadedQrPreview, setUploadedQrPreview] = useState<string | null>(null);
  const [qrFileName, setQrFileName] = useState('');
  const [isSavingQr, setIsSavingQr] = useState(false);

  // Filter states
  const [subscriberSearch, setSubscriberSearch] = useState('');
  const [subscriberStatusFilter, setSubscriberStatusFilter] = useState('All');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('Pending');

  // Modals
  const [inspectingPayment, setInspectingPayment] = useState<PaymentSubmission | null>(null);
  const [showCsvImportModal, setShowCsvImportModal] = useState(false);
  const [editingSubscriber, setEditingSubscriber] = useState<Subscriber | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [subscriberToDelete, setSubscriberToDelete] = useState<Subscriber | null>(null);
  const [isDeletingSubscriber, setIsDeletingSubscriber] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  // Copied helper
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsCheckingAuth(true);
    checkAdminSession()
      .then((isValid) => {
        if (!isMounted) return;
        setIsAuthenticated(isValid);
        if (isValid) {
          loadData();
        }
      })
      .catch((err) => {
        console.error('[Admin] Error verifying session:', err);
        if (!isMounted) return;
        setIsAuthenticated(false);
      })
      .finally(() => {
        if (isMounted) setIsCheckingAuth(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      // ALWAYS load the complete subscriber master list from the database
      // Client-side filtering reactively displays search and status filters without dropping records
      const [subs, pays, cfg] = await Promise.all([
        fetchAdminSubscribers('', 'All').catch((e) => {
          console.warn('[Admin] fetchAdminSubscribers:', e.message);
          return [] as Subscriber[];
        }),
        fetchAdminPayments().catch((e) => {
          console.warn('[Admin] fetchAdminPayments:', e.message);
          return [] as PaymentSubmission[];
        }),
        fetchAppConfig(),
      ]);
      setSubscribers(subs);
      setPayments(pays);
      setPortalUpiId(cfg.upiId);
      setPortalPayeeName(cfg.payeeName);
      setCustomQrImage(cfg.customQrCodeUrl || null);
      setQrInstructions(cfg.qrInstructions || '');
      if (cfg.databaseStatus) setDbStatus(cfg.databaseStatus);
      if (cfg.databaseMessage) setDbStatusMessage(cfg.databaseMessage);
    } catch (err: any) {
      showToast(err.message || 'Failed to load admin data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      setIsLoadingAudit(true);
      const logs = await fetchAuditLogs();
      setAuditLogs(logs);
    } catch (err: any) {
      console.warn('[Admin] loadAuditLogs:', err.message);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && activeTab === 'audit') {
      loadAuditLogs();
    }
  }, [isAuthenticated, activeTab]);

  const handleRecheckDb = async () => {
    try {
      setIsRecheckingDb(true);
      const res = await checkDatabaseStatus();
      if (res.status) setDbStatus(res.status as any);
      if (res.message) setDbStatusMessage(res.message);
      if (res.schemaReady) {
        showToast('Database verified! Authoritative PostgreSQL tables active.', 'success');
        setShowSchemaModal(false);
        loadData();
      } else {
        showToast(res.message || 'Database schema missing', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to check database', 'error');
    } finally {
      setIsRecheckingDb(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsAuthenticating(true);
      const res = await adminLogin(password);
      setAdminToken(res.token);
      setIsAuthenticated(true);
      showToast('Admin session authorized', 'success');
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Incorrect password', 'error');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await adminLogout();
    } catch {}
    clearAdminToken();
    setIsAuthenticated(false);
    showToast('Logged out of admin console', 'info');
    onBackToPortal();
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    showToast(`Copied: ${text}`, 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const [processingPaymentId, setProcessingPaymentId] = useState<string | null>(null);

  const handleApprovePayment = async (paymentId: string, notes: string) => {
    if (processingPaymentId === paymentId) return;
    try {
      setProcessingPaymentId(paymentId);
      await approvePaymentAdmin(paymentId, notes);
      showToast('Payment approved and subscription extended by 60 days', 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to approve payment', 'error');
      throw err;
    } finally {
      setProcessingPaymentId(null);
    }
  };

  const handleRejectPayment = async (paymentId: string, notes: string) => {
    if (processingPaymentId === paymentId) return;
    try {
      setProcessingPaymentId(paymentId);
      await rejectPaymentAdmin(paymentId, notes);
      showToast('Payment marked as Rejected', 'info');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to reject payment', 'error');
      throw err;
    } finally {
      setProcessingPaymentId(null);
    }
  };

  const handleSaveSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubscriber || isSavingSubscriber) return;

    if (!editingSubscriber.telegram_user_id || !editingSubscriber.telegram_user_id.trim()) {
      showToast('Telegram User ID is required', 'error');
      return;
    }

    // Validate Subscription Start Date
    if (editingSubscriber.created_at) {
      const ymdStart = toYMDString(editingSubscriber.created_at);
      if (!ymdStart) {
        showToast('Please enter a valid Subscription Start Date', 'error');
        return;
      }
    }

    // Validate Subscription Expiry Date if provided
    if (editingSubscriber.verified_expiry_date) {
      const ymdExpiry = toYMDString(editingSubscriber.verified_expiry_date);
      if (!ymdExpiry) {
        showToast('Please enter a valid Subscription Expiry Date (or leave empty if unverified)', 'error');
        return;
      }
    }

    try {
      setIsSavingSubscriber(true);
      await upsertAdminSubscriber(editingSubscriber);
      showToast(showAddModal ? 'New subscriber added successfully' : 'Subscriber record updated successfully', 'success');
      setEditingSubscriber(null);
      setShowAddModal(false);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update subscriber', 'error');
    } finally {
      setIsSavingSubscriber(false);
    }
  };

  const handleDeleteSubscriber = async () => {
    if (!subscriberToDelete || isDeletingSubscriber) return;
    try {
      setIsDeletingSubscriber(true);
      await deleteAdminSubscriber(subscriberToDelete.telegram_user_id);
      showToast(
        `Subscriber ${subscriberToDelete.first_name || subscriberToDelete.telegram_user_id} permanently removed. Payment history preserved.`,
        'success'
      );
      setSubscriberToDelete(null);
      if (editingSubscriber?.telegram_user_id === subscriberToDelete.telegram_user_id) {
        setEditingSubscriber(null);
      }
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to remove subscriber', 'error');
    } finally {
      setIsDeletingSubscriber(false);
    }
  };

  const handleDeactivateSubscriber = async (targetId: string, notes?: string) => {
    if (deactivatingId === targetId) return;
    try {
      setDeactivatingId(targetId);
      await deactivateAdminSubscriber(targetId, notes);
      showToast(`Subscriber ${targetId} deactivated. Access revoked while preserving payments.`, 'info');
      if (editingSubscriber?.telegram_user_id === targetId) {
        setEditingSubscriber((prev) => (prev ? { ...prev, status: 'Deactivated', verified_expiry_date: null } : null));
      }
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to deactivate subscriber', 'error');
    } finally {
      setDeactivatingId(null);
    }
  };

  const handleActivateSubscriber = async (targetId: string) => {
    if (deactivatingId === targetId) return;
    try {
      setDeactivatingId(targetId);
      await activateAdminSubscriber(targetId);
      showToast(`Subscriber ${targetId} activated with 60-day access.`, 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to activate subscriber', 'error');
    } finally {
      setDeactivatingId(null);
    }
  };

  const handleExportCsv = async () => {
    try {
      const token = getAdminToken();
      const res = await fetch('/api/admin/subscribers/export-csv', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to export CSV');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `actorsparadise_subscribers_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast('Subscribers CSV exported successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Export failed', 'error');
    }
  };

  const handleQrFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file (PNG, JPG, WebP)', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('QR code image size must be under 5MB', 'error');
      return;
    }

    setQrFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedQrPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveQrConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingQr(true);
      const payload: any = {
        upiId: portalUpiId.trim(),
        payeeName: portalPayeeName.trim(),
        qrInstructions: qrInstructions.trim(),
      };
      if (uploadedQrPreview) {
        payload.customQrCodeUrl = uploadedQrPreview;
      }
      await updateQrConfig(payload);
      showToast('Payment QR code configuration updated successfully!', 'success');
      if (uploadedQrPreview) {
        setCustomQrImage(uploadedQrPreview);
        setUploadedQrPreview(null);
        setQrFileName('');
      }
      onConfigUpdated?.();
    } catch (err: any) {
      showToast(err.message || 'Failed to update QR configuration', 'error');
    } finally {
      setIsSavingQr(false);
    }
  };

  const handleRemoveQrCode = async () => {
    try {
      setIsSavingQr(true);
      await removeCustomQr();
      setCustomQrImage(null);
      setUploadedQrPreview(null);
      setQrFileName('');
      showToast('Custom QR removed. Reverted to generated dynamic UPI QR.', 'info');
      onConfigUpdated?.();
    } catch (err: any) {
      showToast(err.message || 'Failed to remove custom QR code', 'error');
    } finally {
      setIsSavingQr(false);
    }
  };

  // Stats calculation
  const totalSubs = subscribers.length;
  const activeSubs = subscribers.filter((s) => s.status === 'Active').length;
  const expiredSubs = subscribers.filter((s) => s.status === 'Expired').length;
  const deactivatedSubs = subscribers.filter((s) => s.status === 'Deactivated').length;
  const pendingSubs = subscribers.filter((s) => s.status === 'Pending verification').length;
  const pendingPayments = payments.filter((p) => p.status === 'Pending').length;

  // Filtered subscribers
  const filteredSubscribers = subscribers.filter((s) => {
    const matchesSearch =
      subscriberSearch === '' ||
      s.telegram_user_id.toLowerCase().includes(subscriberSearch.toLowerCase()) ||
      s.username.toLowerCase().includes(subscriberSearch.toLowerCase()) ||
      s.first_name.toLowerCase().includes(subscriberSearch.toLowerCase());

    const matchesStatus =
      subscriberStatusFilter === 'All' || s.status === subscriberStatusFilter;

    return matchesSearch && matchesStatus;
  });

  // Filtered payments
  const filteredPayments = payments.filter((p) => {
    if (paymentStatusFilter === 'All') return true;
    return p.status === paymentStatusFilter;
  });

  // Loading state while restoring session on refresh
  if (isCheckingAuth) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-zinc-400 font-mono">Restoring admin session...</p>
        </div>
      </div>
    );
  }

  // If unauthenticated: Admin Passphrase Entry Form
  if (!isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl">
          <div className="w-12 h-12 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4 mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white text-center">Admin Console Authentication</h2>
          <p className="text-xs text-zinc-400 text-center mt-1 mb-6">
            Authorized administrative access for Actorsparadise subscriber verification.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                Admin Passphrase
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Configured via <code className="text-zinc-400 font-mono">ADMIN_PASSWORD</code> (default: <span className="text-purple-300 font-mono">admin123</span>).
              </p>
            </div>

            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-purple-950/50"
            >
              <Shield className="w-4 h-4" />
              <span>{isAuthenticating ? 'Verifying...' : 'Access Admin Dashboard'}</span>
            </button>

            <div className="pt-2">
              <button
                type="button"
                onClick={onBackToPortal}
                className="w-full py-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Return to Member Portal
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Admin Top Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-7 mb-8 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Admin Management Console
              </h1>
              <p className="text-xs text-zinc-400">
                Actorsparadise · Subscribers Master & Payment Proof Verification
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={isLoading}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl border border-zinc-700 transition-colors"
              title="Reload all records"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleLogout}
              className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-6 font-mono">
          <div className="bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800/80">
            <div className="text-[11px] text-zinc-500 font-sans">Total Subscribers</div>
            <div className="text-xl font-bold text-white tabular-nums">{totalSubs}</div>
          </div>
          <div className="bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800/80">
            <div className="text-[11px] text-zinc-500 font-sans">Active Subscribers</div>
            <div className="text-xl font-bold text-emerald-400 tabular-nums">{activeSubs}</div>
          </div>
          <div className="bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800/80">
            <div className="text-[11px] text-zinc-500 font-sans">Pending Verification</div>
            <div className="text-xl font-bold text-amber-400 tabular-nums">{pendingSubs}</div>
          </div>
          <div className="bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800/80">
            <div className="text-[11px] text-zinc-500 font-sans">Expired</div>
            <div className="text-xl font-bold text-rose-400 tabular-nums">{expiredSubs}</div>
          </div>
          <div className="bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800/80 col-span-2 sm:col-span-1">
            <div className="text-[11px] text-zinc-500 font-sans">Pending Proofs</div>
            <div className="text-xl font-bold text-purple-400 tabular-nums">{pendingPayments}</div>
          </div>
        </div>
      </div>

      {/* Live Database Status Banner if schema is missing */}
      {dbStatus === 'schema_missing' && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-950/40 border border-amber-600/40 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-white">Database Schema Setup Required in Supabase</h4>
              <p className="text-xs text-amber-300/90 mt-0.5">
                Supabase project is connected, but base tables (<code className="font-mono bg-amber-950/80 px-1 py-0.5 rounded">subscribers</code>, <code className="font-mono bg-amber-950/80 px-1 py-0.5 rounded">payments</code>, etc.) do not exist in the public schema yet. Run <code className="font-mono bg-amber-950/80 px-1 py-0.5 rounded">supabase_schema.sql</code> in your Supabase SQL Editor.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowSchemaModal(true)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-xl transition-colors shadow"
            >
              View SQL Schema
            </button>
            <button
              onClick={handleRecheckDb}
              disabled={isRecheckingDb}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold rounded-xl border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRecheckingDb ? 'animate-spin' : ''}`} />
              <span>{isRecheckingDb ? 'Checking...' : 'Recheck Connection'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-2 mb-6 border-b border-zinc-800 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('subscribers')}
          className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === 'subscribers'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Subscribers Master</span>
          <span className="text-[11px] bg-black/20 px-1.5 py-0.5 rounded font-mono">
            {subscribers.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === 'payments'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Payment Proofs</span>
          {pendingPayments > 0 && (
            <span className="text-[11px] bg-amber-500 text-black font-bold px-1.5 py-0.5 rounded font-mono">
              {pendingPayments}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('qr_config')}
          className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === 'qr_config'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span>Payment & QR Code</span>
          {customQrImage && (
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono">
              Custom Active
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('system')}
          className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === 'system'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>Deployment & Status</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === 'audit'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Audit Logs</span>
        </button>
      </div>

      {/* TAB 1: SUBSCRIBERS MASTER */}
      {activeTab === 'subscribers' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-5">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex flex-1 items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  value={subscriberSearch}
                  onChange={(e) => setSubscriberSearch(e.target.value)}
                  placeholder="Search Telegram ID, username, or name..."
                  className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Status Filter */}
              <select
                value={subscriberStatusFilter}
                onChange={(e) => setSubscriberStatusFilter(e.target.value)}
                className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Pending verification">Pending verification</option>
                <option value="Expired">Expired</option>
                <option value="Deactivated">Deactivated</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCsvImportModal(true)}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold border border-zinc-700 transition-colors flex items-center gap-1.5"
                title="Import existing subscriber master CSV without duplicates"
              >
                <Upload className="w-3.5 h-3.5 text-purple-400" />
                <span>Import CSV</span>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold border border-zinc-700 transition-colors flex items-center gap-1.5"
                title="Download full subscriber CSV backup"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingSubscriber({
                    telegram_user_id: '',
                    username: '',
                    first_name: '',
                    plan: 'Normal',
                    status: 'Pending verification',
                    verified_expiry_date: null,
                    notes: '',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  });
                  setShowAddModal(true);
                }}
                className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-md shadow-purple-950/50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Subscriber</span>
              </button>
            </div>
          </div>

          {/* Subscribers Table */}
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 text-zinc-400 uppercase tracking-wider font-semibold border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Telegram User ID</th>
                  <th className="py-3 px-4">Username / Name</th>
                  <th className="py-3 px-4">Plan</th>
                  <th className="py-3 px-4">Verified Expiry Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Notes</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 font-mono">
                {filteredSubscribers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-500 font-sans">
                      No subscribers match current search or filters.
                    </td>
                  </tr>
                ) : (
                  filteredSubscribers.map((sub) => {
                    const statusClass =
                      sub.status === 'Active'
                        ? 'text-emerald-400 font-semibold'
                        : sub.status === 'Expired'
                        ? 'text-rose-400 font-semibold'
                        : sub.status === 'Deactivated'
                        ? 'text-zinc-400 font-semibold bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/60'
                        : 'text-amber-400 font-semibold';

                    return (
                      <tr key={sub.telegram_user_id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap text-purple-300 font-bold">
                          <div className="flex items-center gap-1.5">
                            <span>{sub.telegram_user_id}</span>
                            <button
                              onClick={() => handleCopy(sub.telegram_user_id)}
                              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              {copiedId === sub.telegram_user_id ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-sans">
                          <div className="font-medium text-white">{sub.first_name || '—'}</div>
                          {sub.username && (
                            <div className="text-[11px] text-zinc-400">@{sub.username}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-sans font-semibold text-white">
                          {sub.plan}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {sub.verified_expiry_date ? (
                            new Date(sub.verified_expiry_date).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          ) : (
                            <span className="text-amber-400 font-sans text-[11px]">
                              {sub.status === 'Deactivated' ? 'Deactivated' : 'Pending verification'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-sans">
                          <span className={statusClass}>{sub.status}</span>
                        </td>
                        <td className="py-3 px-4 font-sans text-zinc-400 max-w-xs truncate">
                          {sub.notes || '—'}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap font-sans">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Edit Subscriber Details */}
                            <button
                              onClick={() => {
                                setEditingSubscriber(sub);
                                setShowAddModal(false);
                              }}
                              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 transition-colors"
                              title="Edit Subscriber Details"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Deactivate / Reactivate Subscriber */}
                            {sub.status === 'Deactivated' ? (
                              <button
                                onClick={() => handleActivateSubscriber(sub.telegram_user_id)}
                                disabled={deactivatingId === sub.telegram_user_id}
                                className="p-1.5 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 rounded-lg border border-emerald-500/30 transition-colors disabled:opacity-50"
                                title="Reactivate Subscriber (+60 Days)"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleDeactivateSubscriber(sub.telegram_user_id)}
                                disabled={deactivatingId === sub.telegram_user_id}
                                className="p-1.5 bg-zinc-800 hover:bg-amber-950/40 text-zinc-400 hover:text-amber-400 rounded-lg border border-zinc-700 hover:border-amber-500/30 transition-colors disabled:opacity-50"
                                title="Deactivate Subscriber (Revoke active access)"
                              >
                                <UserX className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Remove Subscriber (Safe modal confirmation) */}
                            <button
                              onClick={() => setSubscriberToDelete(sub)}
                              className="p-1.5 bg-zinc-800 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 rounded-lg border border-zinc-700 hover:border-rose-500/30 transition-colors"
                              title="Permanently Remove Subscriber"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PAYMENT PROOFS & APPROVALS */}
      {activeTab === 'payments' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-5">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
            {(['Pending', 'Approved', 'Rejected', 'All'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setPaymentStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  paymentStatusFilter === st
                    ? 'bg-purple-600 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {st}
                {st === 'Pending' && pendingPayments > 0 && (
                  <span className="ml-1.5 bg-amber-500 text-black px-1.5 py-0.2 rounded font-mono text-[10px]">
                    {pendingPayments}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Payments Grid / Table */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPayments.length === 0 ? (
              <div className="col-span-full py-12 text-center text-zinc-500">
                No payment submissions found matching filter: {paymentStatusFilter}
              </div>
            ) : (
              filteredPayments.map((p) => {
                const sub = subscribers.find((s) => s.telegram_user_id === p.telegram_user_id);

                return (
                  <div
                    key={p.id}
                    className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between hover:border-zinc-700 transition-colors shadow-sm"
                  >
                    <div>
                      <div className="flex items-center justify-between pb-2 border-b border-zinc-800 mb-3">
                        <span className="text-xs font-mono text-zinc-500">#{p.id.slice(-6)}</span>
                        <span
                          className={`text-xs font-semibold ${
                            p.status === 'Approved'
                              ? 'text-emerald-400'
                              : p.status === 'Rejected'
                              ? 'text-rose-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {p.status}
                        </span>
                      </div>

                      {/* Member Info */}
                      <div className="space-y-1 mb-3">
                        <div className="text-sm font-bold text-white flex items-center justify-between">
                          <span>{p.first_name} {p.username ? `(@${p.username})` : ''}</span>
                          <span className="text-purple-300 font-mono">₹{p.amount}</span>
                        </div>
                        <div className="text-xs text-zinc-400 font-mono">
                          ID: {p.telegram_user_id}
                        </div>
                        <div className="text-xs text-zinc-500 font-mono">
                          UTR: {p.utr || 'None provided'}
                        </div>
                      </div>

                      {/* Screenshot Thumbnail */}
                      <div className="w-full h-32 bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800 flex items-center justify-center mb-3">
                        {p.proof_url ? (
                          <img
                            src={p.proof_url}
                            alt="Proof thumbnail"
                            className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                            onClick={() => setInspectingPayment(p)}
                          />
                        ) : (
                          <span className="text-xs text-zinc-600">No screenshot</span>
                        )}
                      </div>

                      {p.admin_notes && (
                        <div className="text-[11px] text-zinc-400 bg-zinc-900/60 p-2 rounded border border-zinc-800 mb-3">
                          <strong className="text-zinc-300">Admin Note:</strong> {p.admin_notes}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setInspectingPayment(p)}
                      className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold border border-zinc-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect Proof & Review</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB: PAYMENT & QR CODE MANAGEMENT */}
      {activeTab === 'qr_config' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-8">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <QrCode className="w-5 h-5 text-purple-400" />
              <span>Payment QR Code & UPI Management</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Add or upload your Slice UPI QR code image here. When uploaded, this QR code will be displayed directly to all members on the payment page.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Active QR Preview & Upload Box */}
            <div className="lg:col-span-5 bg-zinc-950 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center text-center">
              <div className="w-full flex items-center justify-between mb-4 pb-2 border-b border-zinc-800">
                <span className="text-xs font-semibold text-zinc-300">Member Portal Display</span>
                {uploadedQrPreview ? (
                  <span className="text-[11px] font-mono text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded">
                    New Preview (Unsaved)
                  </span>
                ) : customQrImage ? (
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
                    Custom QR Active
                  </span>
                ) : (
                  <span className="text-[11px] font-mono text-purple-400 bg-purple-950/40 border border-purple-800/40 px-2 py-0.5 rounded">
                    Dynamic Generated QR
                  </span>
                )}
              </div>

              {/* QR Image Display */}
              <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 shadow-inner mb-4 max-w-xs w-full flex items-center justify-center min-h-[240px]">
                {uploadedQrPreview ? (
                  <img
                    src={uploadedQrPreview}
                    alt="Uploaded QR Code Preview"
                    className="w-56 h-56 rounded-lg object-contain bg-white p-1"
                  />
                ) : customQrImage ? (
                  <img
                    src={customQrImage}
                    alt="Active Custom QR Code"
                    className="w-56 h-56 rounded-lg object-contain bg-white p-1"
                  />
                ) : (
                  <div className="text-center p-4">
                    <QrCode className="w-16 h-16 text-zinc-700 mx-auto mb-2" />
                    <p className="text-xs font-medium text-zinc-300">Dynamic Generated QR Active</p>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Generating dynamically from UPI ID: {portalUpiId}
                    </p>
                  </div>
                )}
              </div>

              {/* Quick Actions for Current QR */}
              {customQrImage && (
                <button
                  type="button"
                  onClick={handleRemoveQrCode}
                  disabled={isSavingQr}
                  className="px-3.5 py-1.5 bg-rose-950/30 hover:bg-rose-900/40 text-rose-300 border border-rose-800/40 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 mb-4"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Custom QR (Revert to Auto-Generated)</span>
                </button>
              )}

              <p className="text-[11px] text-zinc-500">
                Subscribers will see this exact QR code to scan from Slice, GPay, PhonePe, or Paytm.
              </p>
            </div>

            {/* Right: Upload Form & Settings */}
            <div className="lg:col-span-7 bg-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-7 space-y-5">
              <form onSubmit={handleSaveQrConfig} className="space-y-5">
                {/* Upload QR File Area */}
                <div>
                  <label className="text-xs font-bold text-white block mb-1">
                    Upload New QR Code Image
                  </label>
                  <p className="text-xs text-zinc-400 mb-3">
                    Upload an image or screenshot of your Slice QR code (PNG, JPG, WebP up to 5MB).
                  </p>

                  <div className="relative">
                    <input
                      type="file"
                      id="admin-qr-file-input"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleQrFileSelected}
                      className="hidden"
                    />

                    {uploadedQrPreview ? (
                      <div className="bg-zinc-900 border border-purple-500/50 rounded-xl p-3.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <img
                            src={uploadedQrPreview}
                            alt="New QR preview"
                            className="w-12 h-12 rounded object-contain bg-white p-0.5 shrink-0"
                          />
                          <div className="overflow-hidden">
                            <span className="text-xs font-semibold text-white block truncate">
                              {qrFileName || 'New QR Image'}
                            </span>
                            <span className="text-[11px] text-purple-300">
                              Selected for upload. Click "Save & Activate" below.
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setUploadedQrPreview(null);
                            setQrFileName('');
                          }}
                          className="px-2.5 py-1 text-xs text-zinc-400 hover:text-white rounded bg-zinc-800 shrink-0"
                        >
                          Clear
                        </button>
                      </div>
                    ) : (
                      <label
                        htmlFor="admin-qr-file-input"
                        className="border-2 border-dashed border-zinc-800 hover:border-purple-500/60 rounded-xl p-5 text-center cursor-pointer transition-colors bg-zinc-900/50 hover:bg-zinc-900 flex flex-col items-center justify-center group"
                      >
                        <Upload className="w-6 h-6 text-zinc-400 group-hover:text-purple-400 mb-2 transition-colors" />
                        <span className="text-xs font-semibold text-zinc-200 group-hover:text-purple-300">
                          Click to browse or drop Slice QR code image
                        </span>
                        <span className="text-[11px] text-zinc-500 mt-0.5">
                          Recommended: Clean high-contrast square image
                        </span>
                      </label>
                    )}
                  </div>
                </div>

                {/* UPI Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-zinc-800">
                  <div>
                    <label className="text-xs font-semibold text-zinc-300 block mb-1">
                      UPI ID (Slice VPA) <span className="text-purple-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={portalUpiId}
                      onChange={(e) => setPortalUpiId(e.target.value)}
                      placeholder="tharak4321@slc"
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-300 block mb-1">
                      Payee Display Name
                    </label>
                    <input
                      type="text"
                      value={portalPayeeName}
                      onChange={(e) => setPortalPayeeName(e.target.value)}
                      placeholder="Actorsparadise"
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">
                    Subscriber Instructions (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={qrInstructions}
                    onChange={(e) => setQrInstructions(e.target.value)}
                    placeholder="Scan Slice UPI QR to pay directly from any UPI App"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 resize-none"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="submit"
                    disabled={isSavingQr}
                    className="py-2.5 px-6 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-purple-950/50 disabled:opacity-50 flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSavingQr ? 'Saving Settings...' : 'Save & Activate QR Code'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SYSTEM & DEPLOYMENT STATUS */}
      {activeTab === 'system' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
          <div>
            <h3 className="text-lg font-bold text-white">System Architecture & Deployment Guide</h3>
            <p className="text-xs text-zinc-400">
              Actorsparadise configuration, Supabase PostgreSQL status, and Vercel hosting instructions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Environment Status Card */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 space-y-3">
              <span className="text-xs font-bold text-white block pb-2 border-b border-zinc-800">
                Core Integrations Checklist
              </span>

              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Slice UPI ID:</span>
                <span className="font-mono text-purple-300">tharak4321@slc</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Normal Plan:</span>
                <span className="font-mono text-white">₹600 / 60 days</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Super Plan:</span>
                <span className="font-mono text-white">₹1,000 / 60 days</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Support Contact:</span>
                <a
                  href={getTelegramUrl(adminContactTelegram)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-purple-300 hover:text-purple-200 underline inline-flex items-center gap-1"
                  title={`Open Telegram support chat: ${getTelegramDisplay(adminContactTelegram)}`}
                >
                  <span>{getTelegramDisplay(adminContactTelegram)}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Database Engine:</span>
                <span className="font-mono text-emerald-400">PostgreSQL (Supabase Ready)</span>
              </div>
            </div>

            {/* Quick Actions & Deployment Docs */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 space-y-3">
              <span className="text-xs font-bold text-white block pb-2 border-b border-zinc-800">
                Deployment & Backups
              </span>

              <p className="text-xs text-zinc-400">
                Complete documentation is included in the project root:
              </p>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-zinc-300">
                  <FileText className="w-4 h-4 text-purple-400" />
                  <span className="font-mono">supabase_schema.sql</span> (Tables, RLS & Storage)
                </div>
                <div className="flex items-center gap-2 text-zinc-300">
                  <FileText className="w-4 h-4 text-purple-400" />
                  <span className="font-mono">DEPLOYMENT_AND_BACKUP.md</span> (Vercel & Supabase guide)
                </div>
                <div className="flex items-center gap-2 text-zinc-300">
                  <FileText className="w-4 h-4 text-purple-400" />
                  <span className="font-mono">.env.example</span> (Environment configurations)
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Subscriber Master CSV Backup</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-400" />
                <span>Authoritative Audit Logs (public.audit_logs)</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Cryptographically tracked system operations, status changes, and payment approvals.
              </p>
            </div>
            <button
              onClick={loadAuditLogs}
              disabled={isLoadingAudit}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-xl border border-zinc-700 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAudit ? 'animate-spin' : ''}`} />
              <span>Refresh Logs</span>
            </button>
          </div>

          {isLoadingAudit ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-zinc-400">Loading audit records...</span>
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-xs">
              No audit log entries recorded yet. Database operations will appear here in real time.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800 font-mono text-xs max-h-[60vh] overflow-y-auto">
              {auditLogs.map((log) => (
                <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-bold">
                      {log.action}
                    </span>
                    {log.target_user_id && (
                      <span className="text-zinc-300">Target: <strong className="text-white">{log.target_user_id}</strong></span>
                    )}
                    {log.details && Object.keys(log.details).length > 0 && (
                      <span className="text-zinc-500 text-[11px] truncate max-w-xs">
                        {JSON.stringify(log.details)}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-500 shrink-0">
                    {new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'UTC' })} UTC
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SCHEMA VIEW & RECHECK MODAL */}
      {showSchemaModal && (
        <SchemaViewModal
          onClose={() => setShowSchemaModal(false)}
          onRecheck={handleRecheckDb}
          isRechecking={isRecheckingDb}
        />
      )}

      {/* INSPECT PROOF MODAL */}
      {inspectingPayment && (
        <InspectProofModal
          payment={inspectingPayment}
          subscriber={subscribers.find((s) => s.telegram_user_id === inspectingPayment.telegram_user_id)}
          onClose={() => setInspectingPayment(null)}
          onApprove={handleApprovePayment}
          onReject={handleRejectPayment}
        />
      )}

      {/* CSV IMPORT MODAL */}
      {showCsvImportModal && (
        <CsvImportModal
          onClose={() => setShowCsvImportModal(false)}
          onImportCompleted={() => {
            setShowCsvImportModal(false);
            loadData();
          }}
          showToast={showToast}
        />
      )}

      {/* EDIT / ADD SUBSCRIBER MODAL */}
      {(editingSubscriber || showAddModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4">
              {showAddModal ? 'Add Subscriber Manually' : 'Edit Subscriber Details'}
            </h3>

            <form onSubmit={handleSaveSubscriber} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">
                  Telegram User ID <span className="text-purple-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={!showAddModal}
                  value={editingSubscriber?.telegram_user_id || ''}
                  onChange={(e) =>
                    setEditingSubscriber((s) => (s ? { ...s, telegram_user_id: e.target.value } : null))
                  }
                  placeholder="e.g. 884129402"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-white placeholder-zinc-600 disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">Username</label>
                  <input
                    type="text"
                    value={editingSubscriber?.username || ''}
                    onChange={(e) =>
                      setEditingSubscriber((s) => (s ? { ...s, username: e.target.value } : null))
                    }
                    placeholder="dragonbreath1"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">First Name</label>
                  <input
                    type="text"
                    value={editingSubscriber?.first_name || ''}
                    onChange={(e) =>
                      setEditingSubscriber((s) => (s ? { ...s, first_name: e.target.value } : null))
                    }
                    placeholder="Dragon"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">Plan</label>
                  <select
                    value={editingSubscriber?.plan || 'None'}
                    onChange={(e) =>
                      setEditingSubscriber((s) => (s ? { ...s, plan: e.target.value as PlanType } : null))
                    }
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white"
                  >
                    <option value="None">None</option>
                    <option value="Normal">Normal (₹600)</option>
                    <option value="Super">Super (₹1,000)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">Status</label>
                  <select
                    value={editingSubscriber?.status || 'Pending verification'}
                    onChange={(e) =>
                      setEditingSubscriber((s) =>
                        s ? { ...s, status: e.target.value as SubscriptionStatus } : null
                      )
                    }
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white"
                  >
                    <option value="Active">Active</option>
                    <option value="Pending verification">Pending verification</option>
                    <option value="Expired">Expired</option>
                    <option value="Deactivated">Deactivated</option>
                    <option value="None">None</option>
                  </select>
                </div>
              </div>

              {/* Alert when manually activating an expired subscriber */}
              {editingSubscriber?.status === 'Active' &&
                editingSubscriber.verified_expiry_date &&
                new Date(editingSubscriber.verified_expiry_date).getTime() < Date.now() && (
                  <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-white">Manual Access Activation (Past Expiry Date)</p>
                        <p className="text-[11px] text-amber-300/90 mt-0.5">
                          Verified expiry date is currently in the past. Setting status to Active manually grants access while preserving historical dates.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1 border-t border-amber-500/20">
                      <span className="text-[10px] text-zinc-400">Want to extend access instead?</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newIso = new Date(Date.now() + 60 * 86400000).toISOString();
                          setEditingSubscriber((s) => (s ? { ...s, verified_expiry_date: newIso, status: 'Active' } : null));
                        }}
                        className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[11px] font-semibold transition-colors"
                      >
                        Extend +60 Days from Today
                      </button>
                    </div>
                  </div>
                )}

              {/* Subscription Start Date */}
              <DatePickerField
                label="Subscription Start Date"
                value={editingSubscriber?.created_at}
                onChange={(iso) =>
                  setEditingSubscriber((s) => (s ? { ...s, created_at: iso || new Date().toISOString() } : null))
                }
                required
                allowClear={false}
                helpText="The registration / subscription start date (Day, Month, Year). Past or future dates allowed."
                showPresets={true}
              />

              {/* Verified Expiry Date */}
              <DatePickerField
                label="Verified Expiry Date"
                value={editingSubscriber?.verified_expiry_date}
                onChange={(iso) =>
                  setEditingSubscriber((s) => (s ? { ...s, verified_expiry_date: iso } : null))
                }
                required={false}
                allowClear={true}
                helpText="Leave empty for unverified / 'Pending verification'. Day, Month, and Year can be changed independently."
                showPresets={true}
              />

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={editingSubscriber?.notes || ''}
                  onChange={(e) =>
                    setEditingSubscriber((s) => (s ? { ...s, notes: e.target.value } : null))
                  }
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white resize-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-zinc-800/80">
                <div className="flex items-center gap-2">
                  {!showAddModal && editingSubscriber && (
                    <>
                      {editingSubscriber.status === 'Deactivated' ? (
                        <button
                          type="button"
                          disabled={deactivatingId === editingSubscriber.telegram_user_id}
                          onClick={() => handleActivateSubscriber(editingSubscriber.telegram_user_id)}
                          className="px-3 py-1.5 bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/50 rounded-xl text-xs font-semibold border border-emerald-500/30 transition-colors"
                        >
                          Reactivate (+60d)
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={deactivatingId === editingSubscriber.telegram_user_id}
                          onClick={() => handleDeactivateSubscriber(editingSubscriber.telegram_user_id)}
                          className="px-3 py-1.5 bg-zinc-800 text-amber-400 hover:bg-amber-950/40 rounded-xl text-xs font-semibold border border-zinc-700 transition-colors"
                        >
                          Deactivate
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const target = editingSubscriber;
                          setEditingSubscriber(null);
                          setSubscriberToDelete(target);
                        }}
                        className="px-3 py-1.5 bg-zinc-800 text-rose-400 hover:bg-rose-950/40 rounded-xl text-xs font-semibold border border-zinc-700 transition-colors"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSubscriber(null);
                      setShowAddModal(false);
                    }}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingSubscriber}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-md shadow-purple-950/50 disabled:opacity-50"
                  >
                    {isSavingSubscriber ? 'Saving...' : showAddModal ? 'Add Subscriber' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM SUBSCRIBER REMOVAL MODAL */}
      {subscriberToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Confirm Subscriber Removal</h3>
                <p className="text-xs text-zinc-400">
                  Confirmation required before permanent deletion
                </p>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-zinc-500 font-sans">Telegram User ID:</span>
                <span className="text-purple-300 font-semibold">{subscriberToDelete.telegram_user_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-sans">Name / Username:</span>
                <span className="text-white font-sans font-medium">
                  {subscriberToDelete.first_name || 'Member'}{' '}
                  {subscriberToDelete.username ? `(@${subscriberToDelete.username})` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-sans">Plan & Status:</span>
                <span className="text-zinc-300 font-sans">
                  {subscriberToDelete.plan} · {subscriberToDelete.status}
                </span>
              </div>
            </div>

            <div className="bg-amber-950/20 border border-amber-500/25 rounded-xl p-3.5 text-xs text-amber-300/90 space-y-1">
              <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Safe Deletion Guarantee</span>
              </div>
              <p className="text-[11px] text-zinc-300 leading-relaxed font-sans">
                This action removes <strong>only</strong> this explicitly selected subscriber from the master directory. All payment submission history, UPI references, and screenshot proofs will remain safely preserved in Payment Proofs.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingSubscriber}
                onClick={() => setSubscriberToDelete(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingSubscriber}
                onClick={handleDeleteSubscriber}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-rose-950/50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingSubscriber ? 'Removing...' : 'Permanently Remove Subscriber'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
