import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, Upload, Image as ImageIcon, AlertTriangle, Shield, CheckCircle, ExternalLink } from 'lucide-react';
import { PlanConfig, Subscriber } from '../types.js';
import { submitPaymentProof, getTelegramUrl, getTelegramDisplay } from '../lib/api.js';

interface PaymentSectionProps {
  plans: PlanConfig[];
  selectedPlan: 'Normal' | 'Super';
  onSelectPlan: (plan: 'Normal' | 'Super') => void;
  upiId: string;
  payeeName: string;
  customQrCodeUrl?: string | null;
  qrInstructions?: string;
  member: Subscriber | null;
  onOpenLoginModal: () => void;
  onPaymentSubmitted: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  adminContactTelegram?: string;
}

export const PaymentSection: React.FC<PaymentSectionProps> = ({
  plans,
  selectedPlan,
  onSelectPlan,
  upiId,
  payeeName,
  customQrCodeUrl,
  qrInstructions,
  member,
  onOpenLoginModal,
  onPaymentSubmitted,
  showToast,
  adminContactTelegram,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [hasCopiedUpi, setHasCopiedUpi] = useState(false);
  const [useCustomQr, setUseCustomQr] = useState<boolean>(Boolean(customQrCodeUrl));
  const [isZoomingQr, setIsZoomingQr] = useState(false);
  const [utrNumber, setUtrNumber] = useState('');
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string>('');
  const [screenshotMime, setScreenshotMime] = useState<string>('image/jpeg');
  const [fileName, setFileName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  // Sync state if customQrCodeUrl changes
  useEffect(() => {
    if (customQrCodeUrl) {
      setUseCustomQr(true);
    }
  }, [customQrCodeUrl]);

  // Manual fallback fields if member is not logged in yet
  const [manualTelegramId, setManualTelegramId] = useState('');
  const [manualUsername, setManualUsername] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentPlan = plans.find((p) => p.id === selectedPlan) || plans[0] || {
    id: 'Normal',
    name: 'Normal Plan',
    price: 600,
    durationDays: 60,
  };

  const amount = currentPlan.price;

  // Generate dynamic UPI URL and QR Code
  useEffect(() => {
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
      payeeName
    )}&am=${amount}&cu=INR&tn=${encodeURIComponent(`Actorsparadise_${selectedPlan}`)}`;

    QRCode.toDataURL(upiUri, {
      width: 320,
      margin: 2,
      color: {
        dark: '#ffffff',
        light: '#18181b', // zinc-900
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code', err));
  }, [upiId, payeeName, amount, selectedPlan]);

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(upiId);
    setHasCopiedUpi(true);
    showToast(`Copied UPI ID: ${upiId}`, 'success');
    setTimeout(() => setHasCopiedUpi(false), 2500);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file (JPG, PNG, WebP)', 'error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast('File size must be under 10MB', 'error');
      return;
    }

    setFileName(file.name);
    setScreenshotMime(file.type);

    const reader = new FileReader();
    reader.onload = () => {
      setScreenshotDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const targetUserId = member ? member.telegram_user_id : manualTelegramId.trim();
    const targetUsername = member ? member.username : manualUsername.trim();
    const targetName = member ? member.first_name : 'Member';

    if (!targetUserId) {
      showToast('Please provide your Telegram User ID so we can credit your account', 'error');
      return;
    }

    if (!screenshotDataUrl) {
      showToast('Please upload your payment confirmation screenshot', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await submitPaymentProof({
        telegram_user_id: targetUserId,
        username: targetUsername,
        first_name: targetName,
        plan: selectedPlan,
        amount,
        utr: utrNumber.trim(),
        proof_base64: screenshotDataUrl,
        proof_mime_type: screenshotMime,
      });

      setSubmissionSuccess(true);
      showToast('Payment proof submitted! Awaiting admin verification.', 'success');
      onPaymentSubmitted();
    } catch (err: any) {
      showToast(err.message || 'Payment submission failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="payment" className="py-12 sm:py-16 border-t border-zinc-800/80">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center max-w-xl mx-auto mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Slice UPI Payment & Verification
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Pay via any UPI app using the Slice QR code, then upload your payment screenshot.
          </p>
        </div>

        {/* Plan Switcher Pills */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
            <button
              type="button"
              onClick={() => onSelectPlan('Normal')}
              className={`px-5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                selectedPlan === 'Normal'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Normal Plan (₹600)
            </button>
            <button
              type="button"
              onClick={() => onSelectPlan('Super')}
              className={`px-5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                selectedPlan === 'Super'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Super Plan (₹1,000)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Slice UPI QR Code Box */}
          <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-7 flex flex-col items-center text-center shadow-xl">
            <div className="w-full flex items-center justify-between mb-4 pb-3 border-b border-zinc-800">
              <span className="text-xs font-semibold text-zinc-300">Slice UPI Payment</span>
              <span className="text-[11px] font-mono text-purple-400 bg-purple-950/60 border border-purple-800/40 px-2 py-0.5 rounded">
                60 Days Access
              </span>
            </div>

            {/* QR Code Container */}
            <div className="w-full flex flex-col items-center">
              {customQrCodeUrl && (
                <div className="flex items-center gap-1.5 p-1 bg-zinc-950 rounded-lg mb-3 border border-zinc-800 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setUseCustomQr(true)}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                      useCustomQr
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Slice App QR
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseCustomQr(false)}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                      !useCustomQr
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Dynamic UPI QR
                  </button>
                </div>
              )}

              <div
                onClick={() => setIsZoomingQr(true)}
                className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 shadow-inner mb-3 relative group cursor-pointer"
                title="Click to view full-size QR code"
              >
                {useCustomQr && customQrCodeUrl ? (
                  <div className="relative">
                    <img
                      src={customQrCodeUrl}
                      alt="Slice Payment QR Code"
                      className="w-56 h-56 rounded-lg object-contain mx-auto bg-white p-1"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center text-white text-xs font-medium gap-1">
                      <span>Click to zoom</span>
                    </div>
                  </div>
                ) : qrDataUrl ? (
                  <div className="relative">
                    <img
                      src={qrDataUrl}
                      alt={`UPI QR Code for ${currentPlan.name} ₹${amount}`}
                      className="w-56 h-56 rounded-lg object-contain mx-auto"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center text-white text-xs font-medium gap-1">
                      <span>Click to zoom</span>
                    </div>
                  </div>
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center text-zinc-600 text-xs">
                    Generating QR...
                  </div>
                )}
              </div>

              {useCustomQr && customQrCodeUrl && (
                <span className="text-[11px] text-purple-300 font-medium mb-2">
                  Verified Slice QR Code (Admin Uploaded)
                </span>
              )}
            </div>

            <div className="text-xs text-zinc-400 mb-1">
              Pay exact amount:
            </div>
            <div className="text-2xl font-black text-white font-mono tabular-nums mb-4">
              ₹{amount.toLocaleString('en-IN')}
            </div>

            {/* UPI ID Copy Field */}
            <div className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between gap-2 mb-4">
              <div className="text-left overflow-hidden">
                <span className="text-[10px] text-zinc-500 uppercase block font-semibold">UPI ID (Slice)</span>
                <span className="text-xs sm:text-sm font-mono text-purple-300 truncate block">
                  {upiId}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyUpi}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium border border-zinc-700 transition-colors flex items-center gap-1.5 shrink-0"
              >
                {hasCopiedUpi ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Pay via UPI App Intent Button for Mobile */}
            <a
              href={`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
                payeeName
              )}&am=${amount}&cu=INR&tn=${encodeURIComponent(`Actorsparadise_${selectedPlan}`)}`}
              className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-semibold border border-zinc-700 transition-colors flex items-center justify-center gap-2 mb-2"
            >
              <span>Open in UPI App (GPay / PhonePe / Paytm)</span>
              <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
            </a>

            <p className="text-[11px] text-zinc-500">
              Payee Name: <strong className="text-zinc-300">{payeeName}</strong>
            </p>
          </div>

          {/* Right Column: Screenshot Upload & Verification Form */}
          <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl">
            {submissionSuccess ? (
              <div className="py-8 text-center flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mb-4">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Payment Submitted for Review</h3>
                <p className="text-xs sm:text-sm text-zinc-400 max-w-md mb-6">
                  Your screenshot has been received with status <strong className="text-amber-400 font-mono">Pending</strong>.
                  The administrator will verify the payment and record your verified expiry date.
                </p>
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-left w-full text-xs text-zinc-300 space-y-1.5 mb-6">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Plan:</span>
                    <span className="font-semibold text-white">{currentPlan.name} (₹{amount})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Telegram Member ID:</span>
                    <span className="font-mono text-purple-400">{member?.telegram_user_id || manualTelegramId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Verification Status:</span>
                    <span className="text-amber-400 font-medium">Pending verification</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSubmissionSuccess(false);
                    setScreenshotDataUrl('');
                    setFileName('');
                    setUtrNumber('');
                  }}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors"
                >
                  Submit Another Payment
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    Upload Payment Proof
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Step 2: Submit your transaction screenshot for admin confirmation.
                  </p>
                </div>

                {/* Important Notice */}
                <div className="bg-amber-950/20 border border-amber-500/25 rounded-xl p-3.5 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-zinc-300">
                    <strong className="text-amber-300 block mb-0.5">Verification Rule:</strong>
                    Subscriptions are verified manually by admin before activation. Submitting a screenshot does not automatically activate your subscription.
                    <p className="mt-1.5 text-zinc-400">
                      Questions or payment assistance? Message support on Telegram:{' '}
                      <a
                        href={getTelegramUrl(adminContactTelegram)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-300 hover:text-purple-200 underline font-medium inline-flex items-center gap-1"
                        title={`Telegram support: ${getTelegramDisplay(adminContactTelegram)}`}
                      >
                        <span>{getTelegramDisplay(adminContactTelegram)}</span>
                        <ExternalLink className="w-3 h-3 opacity-70" />
                      </a>
                    </p>
                  </div>
                </div>

                {/* Member identification notice */}
                {member ? (
                  <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center font-bold text-xs">
                        AP
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-zinc-200">
                          {member.first_name || `@${member.username}`}
                        </div>
                        <div className="text-[11px] font-mono text-zinc-500">
                          Telegram ID: {member.telegram_user_id}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
                      Linked
                    </span>
                  </div>
                ) : (
                  <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-200">Subscriber Identity</span>
                      <button
                        type="button"
                        onClick={onOpenLoginModal}
                        className="text-xs text-purple-400 hover:text-purple-300 underline font-medium"
                      >
                        Sign in via Telegram
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-zinc-400 block mb-1">
                          Telegram User ID <span className="text-purple-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={manualTelegramId}
                          onChange={(e) => setManualTelegramId(e.target.value)}
                          placeholder="e.g. 884129402"
                          className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-zinc-400 block mb-1">
                          Telegram Username (optional)
                        </label>
                        <input
                          type="text"
                          value={manualUsername}
                          onChange={(e) => setManualUsername(e.target.value)}
                          placeholder="e.g. dragonbreath1"
                          className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* File Upload Box */}
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                    Payment Screenshot <span className="text-purple-400">*</span>
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {screenshotDataUrl ? (
                    <div className="bg-zinc-950 border border-purple-500/40 rounded-xl p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <img
                          src={screenshotDataUrl}
                          alt="Screenshot preview"
                          className="w-14 h-14 rounded-lg object-cover border border-zinc-800 shrink-0"
                        />
                        <div className="overflow-hidden">
                          <p className="text-xs font-medium text-white truncate">{fileName || 'screenshot.jpg'}</p>
                          <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Ready to submit
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium border border-zinc-700 transition-colors shrink-0"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-zinc-800 hover:border-purple-500/60 rounded-xl p-6 text-center cursor-pointer transition-all bg-zinc-950/60 hover:bg-zinc-950 flex flex-col items-center justify-center group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-zinc-900 group-hover:bg-purple-950/40 text-zinc-400 group-hover:text-purple-400 border border-zinc-800 flex items-center justify-center mb-2.5 transition-colors">
                        <Upload className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-semibold text-zinc-300 group-hover:text-purple-300 transition-colors">
                        Click or drag & drop payment screenshot
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Supported formats: JPG, PNG, WebP (up to 10MB)
                      </p>
                    </div>
                  )}
                </div>

                {/* UTR / Transaction Reference (Optional) */}
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                    UTR / UPI Transaction Reference (Optional)
                  </label>
                  <input
                    type="text"
                    value={utrNumber}
                    onChange={(e) => setUtrNumber(e.target.value)}
                    placeholder="e.g. 428901239841"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 font-mono"
                  />
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Entering your 12-digit UPI UTR helps the admin verify your payment faster.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !screenshotDataUrl}
                  className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:hover:bg-purple-600 flex items-center justify-center gap-2 shadow-lg shadow-purple-950/50"
                >
                  {isSubmitting ? (
                    <span>Submitting Payment Proof...</span>
                  ) : (
                    <>
                      <Shield className="w-4 h-4" />
                      <span>Submit Payment for Verification</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* QR Zoom Modal */}
      {isZoomingQr && (
        <div
          onClick={() => setIsZoomingQr(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl relative"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-4">
              <span className="text-sm font-bold text-white">
                {useCustomQr && customQrCodeUrl ? 'Slice UPI Payment QR' : `${currentPlan.name} UPI QR`}
              </span>
              <button
                onClick={() => setIsZoomingQr(false)}
                className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded bg-zinc-800"
              >
                Close
              </button>
            </div>

            <div className="bg-white p-3 rounded-xl mb-4 inline-block">
              <img
                src={(useCustomQr && customQrCodeUrl) ? customQrCodeUrl : qrDataUrl}
                alt="Enlarged QR Code"
                className="w-64 h-64 object-contain mx-auto"
              />
            </div>

            <div className="text-sm font-mono text-purple-300 font-bold mb-1">
              UPI: {upiId}
            </div>
            <div className="text-xs text-zinc-400 mb-4">
              Amount: ₹{amount.toLocaleString('en-IN')}
            </div>

            <button
              onClick={() => setIsZoomingQr(false)}
              className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
