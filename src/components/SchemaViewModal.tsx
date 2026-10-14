import React, { useState } from 'react';
import { X, Copy, Check, Database, ExternalLink, ShieldCheck } from 'lucide-react';

interface SchemaViewModalProps {
  onClose: () => void;
  onRecheck: () => void;
  isRechecking: boolean;
}

const SUPABASE_SCHEMA_SQL = `-- ==========================================================
-- Actorsparadise Subscription Portal - Supabase SQL Schema
-- Safe & Non-Destructive: Uses IF NOT EXISTS
-- ==========================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Subscribers Master Table
CREATE TABLE IF NOT EXISTS public.subscribers (
    telegram_user_id TEXT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    plan TEXT NOT NULL DEFAULT 'None' CHECK (plan IN ('None', 'Normal', 'Super')),
    status TEXT NOT NULL DEFAULT 'Pending verification' CHECK (status IN ('Active', 'Expired', 'Pending verification', 'None', 'Deactivated')),
    verified_expiry_date TIMESTAMPTZ NULL, -- NULL indicates unverified expiry date
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for searching and status filtering
CREATE INDEX IF NOT EXISTS idx_subscribers_username ON public.subscribers(username);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON public.subscribers(status);
CREATE INDEX IF NOT EXISTS idx_subscribers_expiry ON public.subscribers(verified_expiry_date);

-- 2. Payments Table
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY,
    telegram_user_id TEXT NOT NULL,
    username TEXT,
    first_name TEXT,
    plan TEXT NOT NULL CHECK (plan IN ('Normal', 'Super')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    utr TEXT,
    proof_url TEXT NOT NULL,
    proof_mime_type TEXT DEFAULT 'image/jpeg',
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    admin_notes TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    reviewed_at TIMESTAMPTZ NULL,
    reviewed_by TEXT NULL,
    new_expiry_date TIMESTAMPTZ NULL
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_submitted_at ON public.payments(submitted_at DESC);

-- 3. Audit / System Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    action TEXT NOT NULL,
    target_user_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Portal Settings Table (Custom QR Code & Payment Destination)
CREATE TABLE IF NOT EXISTS public.portal_settings (
    id TEXT PRIMARY KEY DEFAULT 'global',
    custom_qr_code_url TEXT NULL,
    upi_id TEXT NOT NULL DEFAULT 'tharak4321@slc',
    payee_name TEXT NOT NULL DEFAULT 'Actorsparadise',
    qr_instructions TEXT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Row Level Security (RLS) Configuration
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_settings ENABLE ROW LEVEL SECURITY;

-- Service Role (Backend Server) has full access
DROP POLICY IF EXISTS "Service role full access subscribers" ON public.subscribers;
CREATE POLICY "Service role full access subscribers" ON public.subscribers
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access payments" ON public.payments;
CREATE POLICY "Service role full access payments" ON public.payments
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access audit_logs" ON public.audit_logs;
CREATE POLICY "Service role full access audit_logs" ON public.audit_logs
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access portal_settings" ON public.portal_settings;
CREATE POLICY "Service role full access portal_settings" ON public.portal_settings
    FOR ALL USING (auth.role() = 'service_role');

-- 6. Private Storage Bucket Setup for Payment Proofs
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Service role manages payment proofs" ON storage.objects;
CREATE POLICY "Service role manages payment proofs" ON storage.objects
    FOR ALL USING (bucket_id = 'payment-proofs' AND auth.role() = 'service_role');
`;

export const SchemaViewModal: React.FC<SchemaViewModalProps> = ({
  onClose,
  onRecheck,
  isRechecking,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-purple-400" />
            <div>
              <h3 className="text-base font-bold text-white">Supabase SQL Schema (supabase_schema.sql)</h3>
              <p className="text-xs text-zinc-400">
                Safe, non-destructive migration script for authoritative PostgreSQL storage
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

        {/* Instructions banner */}
        <div className="p-4 bg-purple-950/30 border-b border-purple-900/40 text-xs text-purple-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>How to Apply to your Supabase Project:</span>
            </div>
            <ol className="list-decimal list-inside text-zinc-300 space-y-0.5 ml-1">
              <li>Open your Supabase project dashboard and click <strong>SQL Editor</strong>.</li>
              <li>Click <strong>New Query</strong>, paste the SQL below, and click <strong>Run</strong>.</li>
              <li>Return here and click <strong>Verify Database Connection</strong> below.</li>
            </ol>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold text-xs transition-colors flex items-center gap-1.5 shadow"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy SQL Schema'}</span>
            </button>
          </div>
        </div>

        {/* SQL Code View */}
        <div className="p-4 overflow-y-auto flex-1 font-mono text-xs bg-zinc-950 text-zinc-300 select-all leading-relaxed whitespace-pre">
          {SUPABASE_SCHEMA_SQL}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between">
          <div className="text-xs text-zinc-500">
            Zero data loss guaranteed: uses <code className="text-zinc-400">CREATE TABLE IF NOT EXISTS</code>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRecheck}
              disabled={isRechecking}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              {isRechecking ? 'Checking Supabase...' : 'Verify Database Connection'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
