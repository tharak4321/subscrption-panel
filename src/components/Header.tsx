import React from 'react';
import { Shield, User, LogOut, ExternalLink } from 'lucide-react';
import { Subscriber } from '../types.js';
import { getTelegramUrl, getTelegramDisplay } from '../lib/api.js';

interface HeaderProps {
  currentView: 'portal' | 'admin';
  onViewChange: (view: 'portal' | 'admin') => void;
  member: Subscriber | null;
  onLogoutMember: () => void;
  onOpenLoginModal: () => void;
  adminContactTelegram: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onViewChange,
  member,
  onLogoutMember,
  onOpenLoginModal,
  adminContactTelegram,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/80 px-4 sm:px-8 py-3.5 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onViewChange('portal')}
            className="flex items-center gap-2.5 text-left group"
          >
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-purple-500/30 group-hover:border-purple-400 transition-colors bg-purple-950/40 flex items-center justify-center shrink-0">
              <img
                src="/src/assets/images/actorsparadise_logo_1791867682147.jpg"
                alt="Actorsparadise"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap group-hover:text-purple-300 transition-colors">
                Actorsparadise
              </span>
              <span className="text-[10px] text-zinc-400 font-mono tracking-wider -mt-1 uppercase">
                Subscription Portal
              </span>
            </div>
          </button>
        </div>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-400">
          <a
            href="#plans"
            onClick={(e) => {
              if (currentView !== 'portal') {
                e.preventDefault();
                onViewChange('portal');
                setTimeout(() => {
                  document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }
            }}
            className="hover:text-purple-300 transition-colors whitespace-nowrap shrink-0"
          >
            Plans
          </a>
          <a
            href="#payment"
            onClick={(e) => {
              if (currentView !== 'portal') {
                e.preventDefault();
                onViewChange('portal');
                setTimeout(() => {
                  document.getElementById('payment')?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }
            }}
            className="hover:text-purple-300 transition-colors whitespace-nowrap shrink-0"
          >
            UPI Payment
          </a>
          {member && (
            <a
              href="#dashboard"
              onClick={(e) => {
                if (currentView !== 'portal') {
                  e.preventDefault();
                  onViewChange('portal');
                }
              }}
              className="hover:text-purple-300 transition-colors whitespace-nowrap shrink-0 text-purple-400 font-semibold"
            >
              My Subscription
            </a>
          )}
          <a
            href={getTelegramUrl(adminContactTelegram)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-purple-300 transition-colors whitespace-nowrap shrink-0"
            title={`Contact support on Telegram: ${getTelegramDisplay(adminContactTelegram)}`}
          >
            Support ({getTelegramDisplay(adminContactTelegram)})
            <ExternalLink className="w-3.5 h-3.5 opacity-60" />
          </a>
        </nav>

        {/* Zone 3: Primary action & admin toggle */}
        <div className="flex items-center gap-3 shrink-0">
          {currentView === 'portal' ? (
            <>
              {member ? (
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex flex-col text-right">
                    <span className="text-xs font-semibold text-zinc-200 truncate max-w-[120px]">
                      {member.first_name || `@${member.username}`}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-500">
                      ID: {member.telegram_user_id}
                    </span>
                  </div>
                  <button
                    onClick={onLogoutMember}
                    title="Sign Out"
                    className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded-lg border border-zinc-800 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={onOpenLoginModal}
                  className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-sm shadow-purple-900/40 flex items-center gap-2"
                >
                  <User className="w-4 h-4" />
                  <span>Member Login</span>
                </button>
              )}

              <button
                onClick={() => onViewChange('admin')}
                className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
                title="Open Admin Dashboard"
              >
                <Shield className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden sm:inline">Admin</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => onViewChange('portal')}
              className="px-3.5 py-1.5 text-xs sm:text-sm font-medium text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Back to Member Portal
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
