import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.js';
import { PlanCards } from './components/PlanCards.js';
import { PaymentSection } from './components/PaymentSection.js';
import { MemberDashboard } from './components/MemberDashboard.js';
import { AdminDashboard } from './components/AdminDashboard.js';
import { TelegramLoginWidget } from './components/TelegramLoginWidget.js';
import { ToastContainer, ToastMessage } from './components/Toast.js';
import { AppConfig, Subscriber } from './types.js';
import {
  fetchAppConfig,
  getStoredMember,
  setStoredMember,
  clearStoredMember,
  getTelegramUrl,
  getTelegramDisplay,
} from './lib/api.js';
import { Sparkles, Shield, ArrowRight, MessageSquare, ExternalLink } from 'lucide-react';

export default function App() {
  // Initialize view from URL hash or localStorage so refreshing stays on admin panel
  const getInitialView = (): 'portal' | 'admin' => {
    if (typeof window !== 'undefined') {
      if (window.location.hash === '#admin') return 'admin';
      const stored = localStorage.getItem('ap_current_view');
      if (stored === 'admin') return 'admin';
    }
    return 'portal';
  };

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [currentView, setCurrentView] = useState<'portal' | 'admin'>(getInitialView);
  const [member, setMember] = useState<Subscriber | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'Normal' | 'Super'>('Normal');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleViewChange = (view: 'portal' | 'admin') => {
    setCurrentView(view);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ap_current_view', view);
      if (view === 'admin') {
        window.location.hash = 'admin';
      } else {
        if (window.location.hash === '#admin') {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    }
  };

  // Sync with browser back/forward and hash changes
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#admin') {
        setCurrentView('admin');
        localStorage.setItem('ap_current_view', 'admin');
      } else if (!window.location.hash && localStorage.getItem('ap_current_view') !== 'admin') {
        setCurrentView('portal');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Load config & restored member session
  useEffect(() => {
    fetchAppConfig()
      .then((cfg) => setConfig(cfg))
      .catch((err) => console.error('Failed to load config:', err));

    const stored = getStoredMember();
    if (stored) {
      setMember(stored);
    }
  }, []);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleLoginSuccess = (sub: Subscriber) => {
    setMember(sub);
    setStoredMember(sub);
    setShowLoginModal(false);
  };

  const handleLogoutMember = () => {
    setMember(null);
    clearStoredMember();
    showToast('Signed out of member profile', 'info');
  };

  const handlePaymentSubmitted = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const plans = config?.plans || [
    {
      id: 'Normal',
      name: 'Normal Plan',
      price: 600,
      currency: 'INR',
      currencySymbol: '₹',
      durationDays: 60,
      description: 'Standard 60-day access tier',
    },
    {
      id: 'Super',
      name: 'Super Plan',
      price: 1000,
      currency: 'INR',
      currencySymbol: '₹',
      durationDays: 60,
      description: 'Priority VIP 60-day access tier',
    },
  ];

  const upiId = config?.upiId || 'tharak4321@slc';
  const payeeName = config?.payeeName || 'Actorsparadise';
  const adminContact = config?.adminContactTelegram || 'dragonbreath1';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-purple-600/30 selection:text-purple-200">
      {/* Top Bar Header */}
      <Header
        currentView={currentView}
        onViewChange={handleViewChange}
        member={member}
        onLogoutMember={handleLogoutMember}
        onOpenLoginModal={() => setShowLoginModal(true)}
        adminContactTelegram={adminContact}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {currentView === 'admin' ? (
          <AdminDashboard
            onBackToPortal={() => handleViewChange('portal')}
            showToast={showToast}
            adminContactTelegram={adminContact}
            onConfigUpdated={() => fetchAppConfig().then(setConfig)}
          />
        ) : (
          <div>
            {/* Hero Section */}
            <section className="relative pt-12 pb-16 sm:pt-20 sm:pb-24 overflow-hidden border-b border-zinc-900">
              {/* Subtle Ambient Radial Glow */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-purple-600/10 blur-[120px] rounded-full"
              />

              <div className="max-w-5xl mx-auto px-4 text-center relative z-10">
                {/* Brand Monogram Avatar */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 rounded-2xl overflow-hidden border border-purple-500/30 shadow-2xl shadow-purple-950/80 bg-zinc-900 flex items-center justify-center p-1">
                  <img
                    src="/src/assets/images/actorsparadise_logo_1791867682147.jpg"
                    alt="Actorsparadise Logo"
                    className="w-full h-full object-cover rounded-xl"
                  />
                </div>

                {/* Main Headline */}
                <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight text-balance max-w-3xl mx-auto">
                  Actorsparadise Subscription Portal
                </h1>

                <p className="mt-4 sm:mt-6 text-sm sm:text-lg text-zinc-400 max-w-2xl mx-auto text-balance font-normal leading-relaxed">
                  Renew or subscribe to your 60-day access tier via Slice UPI. Verified directly against your Telegram User ID by our administrative team.
                </p>

                {/* Trust/Policy Highlights */}
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs text-zinc-400">
                  <span className="text-zinc-300 font-semibold">Normal ₹600 / 60d</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-zinc-300 font-semibold">Super ₹1,000 / 60d</span>
                  <span aria-hidden="true">·</span>
                  <span>UPI: <code className="text-purple-300 font-mono">tharak4321@slc</code></span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Admin Contact:{' '}
                    <a
                      href={getTelegramUrl(adminContact)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-300 hover:text-purple-200 underline underline-offset-2 transition-colors font-medium"
                      title={`Open Telegram support chat: ${getTelegramDisplay(adminContact)}`}
                    >
                      {getTelegramDisplay(adminContact)}
                    </a>
                  </span>
                </div>

                {/* Primary CTA Cluster */}
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <a
                    href="#payment"
                    className="w-full sm:w-auto px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-purple-950/60 flex items-center justify-center gap-2"
                  >
                    <span>Proceed to UPI Payment</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>

                  {!member && (
                    <button
                      onClick={() => setShowLoginModal(true)}
                      className="w-full sm:w-auto px-5 py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 hover:border-zinc-700 rounded-xl text-sm font-medium transition-colors"
                    >
                      Login with Telegram
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* Member Dashboard (If Logged In) */}
            {member && (
              <MemberDashboard
                key={refreshTrigger}
                member={member}
                onRenewClick={() => {
                  document.getElementById('payment')?.scrollIntoView({ behavior: 'smooth' });
                }}
                showToast={showToast}
              />
            )}

            {/* Subscription Plans */}
            <PlanCards
              plans={plans}
              selectedPlan={selectedPlan}
              onSelectPlan={setSelectedPlan}
              adminContactTelegram={adminContact}
            />

            {/* Payment & Screenshot Upload Section */}
            <PaymentSection
              plans={plans}
              selectedPlan={selectedPlan}
              onSelectPlan={setSelectedPlan}
              upiId={upiId}
              payeeName={payeeName}
              customQrCodeUrl={config?.customQrCodeUrl}
              qrInstructions={config?.qrInstructions}
              member={member}
              onOpenLoginModal={() => setShowLoginModal(true)}
              onPaymentSubmitted={handlePaymentSubmitted}
              showToast={showToast}
              adminContactTelegram={adminContact}
            />
          </div>
        )}
      </main>

      {/* Telegram Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <TelegramLoginWidget
            botUsername={config?.telegramBotUsername}
            isBotConfigured={config?.isBotConfigured ?? false}
            onLoginSuccess={handleLoginSuccess}
            onClose={() => setShowLoginModal(false)}
            showToast={showToast}
          />
        </div>
      )}

      {/* Global Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />

      {/* Footer */}
      <footer className="bg-zinc-950 border-t border-zinc-900 py-8 px-4 sm:px-8 text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <span className="font-semibold text-zinc-400">Actorsparadise Subscription Portal</span>
            <span className="hidden sm:inline" aria-hidden="true">·</span>
            <span>Slice UPI: <span className="font-mono text-zinc-400">tharak4321@slc</span></span>
          </div>

          <div className="flex items-center gap-4 text-zinc-400">
            <a
              href={getTelegramUrl(adminContact)}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-purple-300 transition-colors flex items-center gap-1"
              title={`Contact Telegram support: ${getTelegramDisplay(adminContact)}`}
            >
              <span>Support ({getTelegramDisplay(adminContact)})</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <span aria-hidden="true">·</span>
            <button
              onClick={() => setCurrentView('admin')}
              className="hover:text-purple-300 transition-colors flex items-center gap-1"
            >
              <Shield className="w-3 h-3 text-purple-400" />
              <span>Admin Console</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
