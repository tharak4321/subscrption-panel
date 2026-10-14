import React from 'react';
import { Check, ShieldCheck, Zap, MessageSquare, ArrowRight } from 'lucide-react';
import { PlanConfig } from '../types.js';
import { getTelegramUrl, getTelegramDisplay } from '../lib/api.js';

interface PlanCardsProps {
  plans: PlanConfig[];
  selectedPlan: 'Normal' | 'Super';
  onSelectPlan: (plan: 'Normal' | 'Super') => void;
  adminContactTelegram: string;
}

export const PlanCards: React.FC<PlanCardsProps> = ({
  plans,
  selectedPlan,
  onSelectPlan,
  adminContactTelegram,
}) => {
  return (
    <section id="plans" className="py-12 sm:py-16">
      <div className="text-center max-w-2xl mx-auto mb-10 px-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Select Your Subscription Plan
        </h2>
        <p className="mt-2 text-sm sm:text-base text-zinc-400">
          Transparent 60-day access tiers for Actorsparadise. Simple UPI payment, verified by admin.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto px-4">
        {plans.map((p) => {
          const isSelected = selectedPlan === p.id;
          const isSuper = p.id === 'Super';

          return (
            <div
              key={p.id}
              onClick={() => onSelectPlan(p.id)}
              className={`cursor-pointer rounded-2xl border transition-all duration-200 relative overflow-hidden flex flex-col justify-between p-6 sm:p-8 ${
                isSelected
                  ? 'bg-zinc-900 border-purple-500 shadow-xl shadow-purple-950/50 ring-1 ring-purple-500/50'
                  : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
              }`}
            >
              {/* Subtle top indicator */}
              {isSuper && (
                <div className="absolute top-0 right-0 bg-purple-600/20 text-purple-300 text-[11px] font-semibold px-3 py-1 rounded-bl-xl border-l border-b border-purple-500/30">
                  Recommended Tier
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isSuper
                        ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                        : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                    }`}
                  >
                    {isSuper ? <Zap className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                  </div>
                  <h3 className="text-xl font-bold text-white">{p.name}</h3>
                </div>

                <div className="flex items-baseline gap-1 mt-4 mb-2">
                  <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-mono tabular-nums">
                    ₹{p.price.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs text-zinc-400 font-medium">
                    / {p.durationDays} days
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-zinc-400 mb-6">
                  {p.description}
                </p>

                <div className="space-y-2.5 pt-4 border-t border-zinc-800/80 mb-6 text-xs text-zinc-300">
                  <div className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>Active duration: <strong className="text-white font-mono">{p.durationDays} calendar days</strong></span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>Verified Telegram User ID binding</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>60-day renewal extension policy</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>
                      {isSuper
                        ? 'Super priority status & VIP group access'
                        : 'Standard member portal access'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPlan(p.id);
                    document.getElementById('payment')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                    isSelected
                      ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                  }`}
                >
                  <span>{isSelected ? `Selected (${p.name})` : `Choose ${p.name}`}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Contact Support Banner */}
      <div className="max-w-4xl mx-auto mt-6 px-4">
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-purple-400 shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-200">
                Have questions or need manual confirmation?
              </p>
              <p className="text-[11px] text-zinc-400">
                Direct Telegram contact with portal admin
              </p>
            </div>
          </div>
          <a
            href={getTelegramUrl(adminContactTelegram)}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-purple-300 hover:text-white rounded-lg text-xs font-medium border border-zinc-700 transition-colors flex items-center gap-1.5 shrink-0"
            title={`Message ${getTelegramDisplay(adminContactTelegram)} on Telegram`}
          >
            <span>Message {getTelegramDisplay(adminContactTelegram)}</span>
          </a>
        </div>
      </div>
    </section>
  );
};
