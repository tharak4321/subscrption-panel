import React, { useState } from 'react';
import { X, CheckCircle, XCircle, Shield, AlertTriangle, ZoomIn, ZoomOut, User, Calendar, Tag } from 'lucide-react';
import { PaymentSubmission, Subscriber } from '../types.js';

interface InspectProofModalProps {
  payment: PaymentSubmission;
  subscriber?: Subscriber | null;
  onClose: () => void;
  onApprove: (paymentId: string, notes: string) => Promise<void>;
  onReject: (paymentId: string, notes: string) => Promise<void>;
}

export const InspectProofModal: React.FC<InspectProofModalProps> = ({
  payment,
  subscriber,
  onClose,
  onApprove,
  onReject,
}) => {
  const [adminNotes, setAdminNotes] = useState(payment.admin_notes || '');
  const [actionType, setActionType] = useState<'view' | 'approve' | 'reject'>('view');
  const [isProcessing, setIsProcessing] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Exact 60-day renewal calculation preview:
  // "When approving a renewal, extend the subscription by 60 days from the later of today or the existing verified expiry date."
  const now = new Date();
  let baseDate = now;
  let calculationExplanation = 'Starting from today (as no prior verified future expiry exists)';

  if (subscriber?.verified_expiry_date) {
    const existingDate = new Date(subscriber.verified_expiry_date);
    if (!isNaN(existingDate.getTime()) && existingDate > now) {
      baseDate = existingDate;
      calculationExplanation = `Starting from existing verified expiry (${existingDate.toLocaleDateString(
        'en-IN'
      )}) because it is later than today`;
    }
  }

  const projectedNewExpiry = new Date(baseDate.getTime() + 60 * 86400000);

  const handleConfirmAction = async () => {
    if (isProcessing) return;
    try {
      setIsProcessing(true);
      if (actionType === 'approve') {
        await onApprove(payment.id, adminNotes);
      } else if (actionType === 'reject') {
        await onReject(payment.id, adminNotes);
      }
      onClose();
    } catch {
      // Keep modal open so the error toast is visible and the admin can retry or cancel
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Modal Top Bar */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Payment Proof Inspection</h3>
              <p className="text-xs text-zinc-400 font-mono">
                Payment Ref: {payment.id} · Status: <span className="text-purple-300 font-semibold">{payment.status}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Screenshot Display Box */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center bg-zinc-950 border border-zinc-800 rounded-xl p-3 overflow-hidden relative">
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-zinc-900/90 border border-zinc-800 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(0.75, z - 0.25))}
                className="p-1 text-zinc-400 hover:text-white"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[10px] text-zinc-400 px-1 font-mono">{Math.round(zoomLevel * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.25))}
                className="p-1 text-zinc-400 hover:text-white"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            <div className="w-full h-[360px] sm:h-[420px] flex items-center justify-center overflow-auto">
              {payment.proof_url ? (
                <img
                  src={payment.proof_url}
                  alt={`Proof for ${payment.id}`}
                  style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center' }}
                  className="max-h-full max-w-full object-contain rounded transition-transform"
                />
              ) : (
                <div className="text-zinc-600 text-xs text-center p-6">
                  No visual proof attached or screenshot failed to load.
                </div>
              )}
            </div>
          </div>

          {/* Details & Actions Pane */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-4 text-xs space-y-2.5">
                <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Telegram User ID:</span>
                  <span className="font-mono text-purple-400 font-bold">{payment.telegram_user_id}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Username:</span>
                  <span className="text-white font-medium">{payment.username ? `@${payment.username}` : 'Not provided'}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Plan Requested:</span>
                  <span className="text-white font-semibold">{payment.plan} (₹{payment.amount.toLocaleString('en-IN')})</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                  <span className="text-zinc-400">UTR / Ref Number:</span>
                  <span className="font-mono text-zinc-200">{payment.utr || 'Not provided'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Submitted At:</span>
                  <span className="text-zinc-400">
                    {new Date(payment.submitted_at).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>

              {/* Renewal Calculation Preview Box */}
              <div className="bg-purple-950/20 border border-purple-500/20 rounded-xl p-3.5 text-xs">
                <span className="font-semibold text-purple-300 block mb-1">
                  60-Day Renewal Calculation Formula:
                </span>
                <p className="text-[11px] text-zinc-300 mb-1.5">{calculationExplanation}</p>
                <div className="bg-zinc-950/80 p-2 rounded border border-purple-900/40 font-mono text-[11px] flex justify-between">
                  <span className="text-zinc-400">Projected Expiry:</span>
                  <span className="text-purple-300 font-bold">
                    {projectedNewExpiry.toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>

              {/* Admin Notes */}
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">
                  Admin Verification Notes
                </label>
                <textarea
                  rows={2}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="e.g. Verified via Slice App transaction list"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>
            </div>

            {/* Action Buttons & Status Guards */}
            {payment.status === 'Approved' ? (
              <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-300 flex items-center gap-2.5">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-bold text-white">Payment Already Approved</div>
                  <div className="text-[11px] text-zinc-300">
                    This payment has already been verified and approved.
                    {payment.new_expiry_date && (
                      <span> Subscription extended to {new Date(payment.new_expiry_date).toLocaleDateString('en-IN')}.</span>
                    )}
                  </div>
                </div>
              </div>
            ) : payment.status === 'Rejected' ? (
              <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl p-3.5 text-xs text-rose-300 flex items-center gap-2.5">
                <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                <div>
                  <div className="font-bold text-white">Payment Already Rejected</div>
                  <div className="text-[11px] text-zinc-300">
                    This payment submission has been rejected.
                    {payment.admin_notes && (
                      <span> Note: {payment.admin_notes}</span>
                    )}
                  </div>
                </div>
              </div>
            ) : actionType === 'view' ? (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActionType('reject')}
                  className="py-2.5 px-4 bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 border border-rose-800/40 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject Payment</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActionType('approve')}
                  className="py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-purple-950/50"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Approve (+60 Days)</span>
                </button>
              </div>
            ) : actionType === 'approve' ? (
              <div className="bg-zinc-950 border border-purple-500/40 rounded-xl p-3.5 space-y-3">
                <p className="text-xs text-zinc-200">
                  Confirm approval for <strong className="text-white">Telegram ID {payment.telegram_user_id}</strong>?
                  This will extend subscription to{' '}
                  <strong className="text-purple-400">
                    {projectedNewExpiry.toLocaleDateString('en-IN')}
                  </strong>.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => setActionType('view')}
                    className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleConfirmAction}
                    className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    {isProcessing ? 'Processing Approval...' : 'Confirm Approval'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-zinc-950 border border-rose-500/40 rounded-xl p-3.5 space-y-3">
                <p className="text-xs text-zinc-200">
                  Are you sure you want to reject this payment submission? (Reason will be recorded).
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => setActionType('view')}
                    className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleConfirmAction}
                    className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    {isProcessing ? 'Processing...' : 'Confirm Rejection'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
