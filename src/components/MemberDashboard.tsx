import React, { useEffect, useState } from 'react';
import { Calendar, Shield, Clock, AlertCircle, CheckCircle2, XCircle, ArrowUpRight, Copy, Check, RefreshCw } from 'lucide-react';
import { Subscriber, PaymentSubmission } from '../types.js';
import { fetchMemberProfile } from '../lib/api.js';

interface MemberDashboardProps {
  member: Subscriber;
  onRenewClick: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const MemberDashboard: React.FC<MemberDashboardProps> = ({
  member,
  onRenewClick,
  showToast,
}) => {
  const [profileData, setProfileData] = useState<{
    subscriber: Subscriber;
    payments: PaymentSubmission[];
    daysRemaining: number | null;
    isVerified: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCopiedId, setHasCopiedId] = useState(false);

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      const data = await fetchMemberProfile(member.telegram_user_id);
      setProfileData(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to refresh subscriber profile', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [member.telegram_user_id]);

  const handleCopyId = () => {
    navigator.clipboard.writeText(member.telegram_user_id);
    setHasCopiedId(true);
    showToast(`Copied Telegram ID: ${member.telegram_user_id}`, 'success');
    setTimeout(() => setHasCopiedId(false), 2000);
  };

  const subscriber = profileData?.subscriber || member;
  const payments = profileData?.payments || [];
  const daysRemaining = profileData?.daysRemaining ?? null;
  const isVerified = Boolean(subscriber.verified_expiry_date);

  const formatDate = (isoString: string | null) => {
    if (!isoString) return 'Pending verification';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return 'Pending verification';
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return 'Pending verification';
    }
  };

  return (
    <section id="dashboard" className="py-12 border-t border-zinc-800/80">
      <div className="max-w-5xl mx-auto px-4">
        {/* Profile Card Header */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 mb-8 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold text-lg shrink-0">
                {subscriber.first_name ? subscriber.first_name[0].toUpperCase() : 'M'}
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                  <span>{subscriber.first_name || 'Member'}</span>
                  {subscriber.username && (
                    <span className="text-xs sm:text-sm text-zinc-400 font-normal">
                      (@{subscriber.username})
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-zinc-500 font-mono">
                    Telegram ID: {subscriber.telegram_user_id}
                  </span>
                  <button
                    onClick={handleCopyId}
                    className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Copy Telegram User ID"
                  >
                    {hasCopiedId ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={loadProfile}
                disabled={isLoading}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium border border-zinc-700 transition-colors flex items-center gap-1.5"
                title="Refresh Status"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                onClick={onRenewClick}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-md shadow-purple-900/40"
              >
                <span>Renew / Extend</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Subscription Status Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
            {/* 1. Subscription Plan */}
            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-5">
              <span className="text-xs text-zinc-400 block mb-1">Current Plan</span>
              <div className="text-xl font-bold text-white">
                {subscriber.plan !== 'None' ? `${subscriber.plan} Plan` : 'No Active Plan'}
              </div>
              <span className="text-xs text-zinc-500 mt-2 block">
                {subscriber.plan === 'Super'
                  ? '₹1,000 / 60-day VIP tier'
                  : subscriber.plan === 'Normal'
                  ? '₹600 / 60-day Standard tier'
                  : 'Select a plan below to subscribe'}
              </span>
            </div>

            {/* 2. Verification Status */}
            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-5">
              <span className="text-xs text-zinc-400 block mb-1">Verification Status</span>
              <div className="flex items-center gap-2">
                {subscriber.status === 'Active' ? (
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-lg">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span>Active Subscriber</span>
                  </div>
                ) : subscriber.status === 'Expired' ? (
                  <div className="flex items-center gap-2 text-rose-400 font-bold text-lg">
                    <XCircle className="w-5 h-5 shrink-0" />
                    <span>Expired</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-lg">
                    <Clock className="w-5 h-5 shrink-0" />
                    <span>Pending verification</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                {subscriber.status === 'Active'
                  ? 'Verified by Actorsparadise administration'
                  : subscriber.status === 'Expired'
                  ? 'Your 60-day period has concluded. Renew to restore access.'
                  : 'Awaiting admin review of payment proof'}
              </p>
            </div>

            {/* 3. Verified Expiry Date */}
            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-5">
              <span className="text-xs text-zinc-400 block mb-1">Verified Expiry Date</span>
              <div className="text-xl font-mono tabular-nums text-white">
                {isVerified ? (
                  formatDate(subscriber.verified_expiry_date)
                ) : (
                  <span className="text-amber-400/90 font-sans font-semibold text-base">
                    Pending verification
                  </span>
                )}
              </div>
              <div className="text-xs text-zinc-500 mt-2">
                {isVerified && daysRemaining !== null ? (
                  <span className="text-purple-300 font-medium">
                    {daysRemaining} day{daysRemaining === 1 ? '' : 's'} remaining
                  </span>
                ) : (
                  <span>Never invent dates — assigned only on verified payment</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Payment Submissions Ledger */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-white">Payment Submission History</h3>
              <p className="text-xs text-zinc-400">
                Log of all Slice UPI submissions for Telegram ID {subscriber.telegram_user_id}
              </p>
            </div>
            <span className="text-xs font-mono text-zinc-500">
              {payments.length} submission{payments.length === 1 ? '' : 's'}
            </span>
          </div>

          {payments.length === 0 ? (
            <div className="py-12 text-center bg-zinc-950/40 rounded-xl border border-dashed border-zinc-800">
              <AlertCircle className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-zinc-300">No payment submissions found</p>
              <p className="text-xs text-zinc-500 mt-1 mb-4">
                Upload your payment screenshot below to begin the verification process.
              </p>
              <button
                onClick={onRenewClick}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-medium transition-colors"
              >
                Submit Payment Now
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Plan</th>
                    <th className="py-3 px-3">Amount</th>
                    <th className="py-3 px-3">UTR / Ref</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Admin Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono">
                  {payments.map((p) => {
                    const statusClass =
                      p.status === 'Approved'
                        ? 'text-emerald-400'
                        : p.status === 'Rejected'
                        ? 'text-rose-400'
                        : 'text-amber-400';

                    return (
                      <tr key={p.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-3 px-3 whitespace-nowrap text-zinc-400 font-sans">
                          {new Date(p.submitted_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-sans font-medium text-white">
                          {p.plan}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap tabular-nums text-white">
                          ₹{p.amount.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-zinc-400">
                          {p.utr || '—'}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-sans font-semibold">
                          <span className={statusClass}>{p.status}</span>
                        </td>
                        <td className="py-3 px-3 font-sans text-zinc-400 max-w-xs truncate">
                          {p.admin_notes || (p.status === 'Pending' ? 'Awaiting verification' : '—')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
