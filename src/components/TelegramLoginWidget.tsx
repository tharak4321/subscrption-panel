import React, { useEffect, useRef, useState } from 'react';
import { Send, CheckCircle2, AlertCircle, X, HelpCircle } from 'lucide-react';
import { authenticateTelegram, authenticateDemo } from '../lib/api.js';
import { Subscriber } from '../types.js';

interface TelegramLoginWidgetProps {
  botUsername?: string;
  isBotConfigured: boolean;
  onLoginSuccess: (subscriber: Subscriber) => void;
  onClose?: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const TelegramLoginWidget: React.FC<TelegramLoginWidgetProps> = ({
  botUsername,
  isBotConfigured,
  onLoginSuccess,
  onClose,
  showToast,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'widget' | 'manual'>(
    botUsername && isBotConfigured ? 'widget' : 'manual'
  );
  const [manualId, setManualId] = useState('');
  const [manualUsername, setManualUsername] = useState('');
  const [manualFirstName, setManualFirstName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showIdHelp, setShowIdHelp] = useState(false);

  // Expose global callback for Telegram Login Widget
  useEffect(() => {
    (window as any).onTelegramAuth = async (user: any) => {
      try {
        setIsLoading(true);
        const res = await authenticateTelegram(user);
        showToast(`Welcome back, ${res.subscriber.first_name || res.subscriber.username}!`, 'success');
        onLoginSuccess(res.subscriber);
      } catch (err: any) {
        showToast(err.message || 'Telegram verification failed', 'error');
      } finally {
        setIsLoading(false);
      }
    };

    return () => {
      delete (window as any).onTelegramAuth;
    };
  }, [onLoginSuccess, showToast]);

  // Inject official Telegram Widget Script if bot is configured
  useEffect(() => {
    if (activeTab === 'widget' && botUsername && containerRef.current) {
      containerRef.current.innerHTML = '';
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.setAttribute('data-telegram-login', botUsername);
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-radius', '8');
      script.setAttribute('data-request-access', 'write');
      script.setAttribute('data-onauth', 'onTelegramAuth(user)');
      script.async = true;
      containerRef.current.appendChild(script);
    }
  }, [activeTab, botUsername]);

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualId.trim()) {
      showToast('Please enter your Telegram User ID', 'error');
      return;
    }

    try {
      setIsLoading(true);
      const res = await authenticateDemo(
        manualId.trim(),
        manualUsername.trim(),
        manualFirstName.trim()
      );
      showToast(`Logged in as Telegram ID: ${res.subscriber.telegram_user_id}`, 'success');
      onLoginSuccess(res.subscriber);
    } catch (err: any) {
      showToast(err.message || 'Login failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreFill = (id: string, user: string, name: string) => {
    setManualId(id);
    setManualUsername(user);
    setManualFirstName(name);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full relative shadow-2xl">
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-200 p-1 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
          <Send className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Telegram Authentication</h3>
          <p className="text-xs text-zinc-400">Sign in with your verified Telegram account</p>
        </div>
      </div>

      {/* Segmented Control Tabs */}
      <div className="flex items-center p-1 bg-zinc-950 rounded-lg mb-5 border border-zinc-800">
        <button
          onClick={() => setActiveTab('widget')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
            activeTab === 'widget'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Telegram Widget
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
            activeTab === 'manual'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Direct Telegram ID
        </button>
      </div>

      {activeTab === 'widget' ? (
        <div className="flex flex-col items-center justify-center py-4 space-y-4 text-center">
          {botUsername ? (
            <>
              <p className="text-xs text-zinc-300">
                Click below to authorize securely via{' '}
                <span className="text-purple-400 font-semibold font-mono">@{botUsername}</span>:
              </p>
              <div
                ref={containerRef}
                className="min-h-[50px] flex items-center justify-center py-2"
              />
              <p className="text-[11px] text-zinc-500 max-w-xs">
                Note: Ensure your domain is registered in @BotFather via{' '}
                <code className="text-zinc-400 bg-zinc-800 px-1 py-0.5 rounded">/setdomain</code>.
              </p>
            </>
          ) : (
            <div className="bg-zinc-950/70 border border-amber-500/20 rounded-xl p-4 text-left">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold mb-1">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Bot Token Not Yet Configured in .env</span>
              </div>
              <p className="text-xs text-zinc-400 mb-3">
                To enable the official Telegram Login button, set{' '}
                <code className="text-purple-300 font-mono">TELEGRAM_BOT_USERNAME</code> and{' '}
                <code className="text-purple-300 font-mono">TELEGRAM_BOT_TOKEN</code> in your environment.
              </p>
              <button
                onClick={() => setActiveTab('manual')}
                className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-medium transition-colors"
              >
                Switch to Direct Telegram ID Login
              </button>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleManualLogin} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-zinc-300">
                Telegram User ID <span className="text-purple-400">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowIdHelp(!showIdHelp)}
                className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                <HelpCircle className="w-3 h-3" />
                <span>How to find ID?</span>
              </button>
            </div>
            <input
              type="text"
              required
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="e.g. 884129402 or 992144319"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 font-mono"
            />
          </div>

          {showIdHelp && (
            <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-3 text-xs text-zinc-300 space-y-1">
              <p className="font-semibold text-purple-300">Finding your Telegram ID:</p>
              <p>1. Open Telegram and search for <span className="text-white font-mono">@userinfobot</span>.</p>
              <p>2. Send <span className="text-white font-mono">/start</span> to see your numeric Telegram User ID.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                Username (optional)
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-zinc-500 text-xs">@</span>
                <input
                  type="text"
                  value={manualUsername}
                  onChange={(e) => setManualUsername(e.target.value)}
                  placeholder="dragonbreath1"
                  className="w-full pl-6 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                First Name (optional)
              </label>
              <input
                type="text"
                value={manualFirstName}
                onChange={(e) => setManualFirstName(e.target.value)}
                placeholder="Dragon"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Quick Demo Pre-fills */}
          <div className="pt-1">
            <span className="text-[11px] text-zinc-500 block mb-1.5">Quick Test Profiles:</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handlePreFill('884129402', 'dragonbreath1', 'Dragon')}
                className="px-2 py-1 text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
              >
                @dragonbreath1 (Active)
              </button>
              <button
                type="button"
                onClick={() => handlePreFill('773091224', 'kavitha_m', 'Kavitha')}
                className="px-2 py-1 text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
              >
                @kavitha_m (Pending)
              </button>
              <button
                type="button"
                onClick={() => handlePreFill('661902844', 'vikram_cine', 'Vikram')}
                className="px-2 py-1 text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
              >
                @vikram_cine (Expired)
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-purple-900/30"
          >
            {isLoading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Enter Subscription Portal</span>
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
};
