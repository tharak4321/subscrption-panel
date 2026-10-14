-- ==========================================================
-- Actorsparadise Subscription Portal - Supabase SQL Schema
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
-- Ensure tables have RLS enabled
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
-- Create bucket 'payment-proofs' if using Supabase Storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Private storage policy: Only service role can read/write payment screenshots
DROP POLICY IF EXISTS "Service role manages payment proofs" ON storage.objects;
CREATE POLICY "Service role manages payment proofs" ON storage.objects
    FOR ALL USING (bucket_id = 'payment-proofs' AND auth.role() = 'service_role');
