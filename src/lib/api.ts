import { AppConfig, Subscriber, PaymentSubmission, CsvImportResult } from '../types.js';

const ADMIN_TOKEN_KEY = 'ap_admin_token';
const MEMBER_SESSION_KEY = 'ap_member_session';

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function getStoredMember(): Subscriber | null {
  try {
    const raw = localStorage.getItem(MEMBER_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredMember(member: Subscriber) {
  localStorage.setItem(MEMBER_SESSION_KEY, JSON.stringify(member));
}

export function clearStoredMember() {
  localStorage.removeItem(MEMBER_SESSION_KEY);
}

export async function fetchAppConfig(): Promise<AppConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Failed to load application configuration');
  return res.json();
}

export async function authenticateTelegram(authData: Record<string, any>): Promise<{ subscriber: Subscriber; verifiedViaHash: boolean }> {
  const res = await fetch('/api/auth/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(authData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Telegram authentication failed');
  return data;
}

export async function authenticateDemo(telegram_user_id: string, username?: string, first_name?: string): Promise<{ subscriber: Subscriber }> {
  const res = await fetch('/api/auth/demo-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegram_user_id, username, first_name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

export async function fetchMemberProfile(userId: string): Promise<{
  subscriber: Subscriber;
  payments: PaymentSubmission[];
  daysRemaining: number | null;
  isVerified: boolean;
}> {
  const res = await fetch(`/api/member/profile/${encodeURIComponent(userId)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch member profile');
  return data;
}

export async function submitPaymentProof(payload: {
  telegram_user_id: string;
  username: string;
  first_name: string;
  plan: 'Normal' | 'Super';
  amount: number;
  utr?: string;
  proof_base64: string;
  proof_mime_type: string;
}): Promise<{ success: boolean; message: string; submission: any }> {
  const res = await fetch('/api/member/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to submit payment proof');
  return data;
}

// Admin APIs

export async function adminLogin(password: string): Promise<{ token: string }> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Invalid admin password');
  return data;
}

export async function checkAdminSession(): Promise<boolean> {
  const token = getAdminToken();
  if (!token) return false;
  try {
    const res = await fetch('/api/admin/check', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function adminLogout(): Promise<void> {
  const token = getAdminToken();
  if (token) {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }
  clearAdminToken();
}

export async function fetchAdminSubscribers(search?: string, status?: string): Promise<Subscriber[]> {
  const token = getAdminToken();
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);

  const res = await fetch(`/api/admin/subscribers?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch subscribers');
  return data.subscribers || [];
}

export async function upsertAdminSubscriber(sub: Partial<Subscriber> & { telegram_user_id: string }): Promise<Subscriber> {
  const token = getAdminToken();
  const res = await fetch('/api/admin/subscribers/upsert', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(sub),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update subscriber');
  return data.subscriber;
}

export async function importSubscribersCsv(records: Array<Record<string, string>>, mode: 'skip_existing' | 'merge_existing'): Promise<CsvImportResult> {
  const token = getAdminToken();
  const res = await fetch('/api/admin/subscribers/import-csv', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ records, mode }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'CSV import failed');
  return data.result;
}

export async function fetchAdminPayments(status?: string): Promise<PaymentSubmission[]> {
  const token = getAdminToken();
  const params = new URLSearchParams();
  if (status) params.set('status', status);

  const res = await fetch(`/api/admin/payments?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch payments');
  return data.payments || [];
}

export async function approvePaymentAdmin(paymentId: string, adminNotes: string): Promise<{ payment: PaymentSubmission; subscriber: Subscriber }> {
  const token = getAdminToken();
  const cleanId = String(paymentId).trim();
  const res = await fetch(`/api/admin/payments/${encodeURIComponent(cleanId)}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ paymentId: cleanId, admin_notes: adminNotes, reviewed_by: 'Admin' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to approve payment');
  return data;
}

export async function rejectPaymentAdmin(paymentId: string, adminNotes: string): Promise<PaymentSubmission> {
  const token = getAdminToken();
  const cleanId = String(paymentId).trim();
  const res = await fetch(`/api/admin/payments/${encodeURIComponent(cleanId)}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ paymentId: cleanId, admin_notes: adminNotes, reviewed_by: 'Admin' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to reject payment');
  return data.payment;
}

export async function updateQrConfig(payload: {
  customQrCodeUrl?: string | null;
  upiId?: string;
  payeeName?: string;
  qrInstructions?: string;
}): Promise<{ success: boolean; message: string; settings: any }> {
  const token = getAdminToken();
  const res = await fetch('/api/admin/config/qr', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update QR configuration');
  return data;
}

export async function removeCustomQr(): Promise<{ success: boolean; message: string; settings: any }> {
  const token = getAdminToken();
  const res = await fetch('/api/admin/config/qr', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to remove custom QR code');
  return data;
}

/**
 * Normalizes a Telegram username safely by stripping any leading '@' symbols.
 */
export function normalizeTelegramUsername(username?: string | null): string {
  if (!username) return 'dragonbreath1';
  return String(username).trim().replace(/^@+/, '').trim() || 'dragonbreath1';
}

/**
 * Returns the exact Telegram chat URL: https://t.me/<username>
 * Guaranteed never to have an extra '@' in the URL.
 */
export function getTelegramUrl(username?: string | null): string {
  const clean = normalizeTelegramUsername(username);
  return `https://t.me/${clean}`;
}

/**
 * Returns the Telegram display handle with exactly one '@': @<username>
 */
export function getTelegramDisplay(username?: string | null): string {
  const clean = normalizeTelegramUsername(username);
  return `@${clean}`;
}

export async function deleteAdminSubscriber(
  telegramUserId: string
): Promise<{ success: boolean; message: string; deletedUserId: string }> {
  const token = getAdminToken();
  const cleanId = String(telegramUserId).trim();
  const res = await fetch(`/api/admin/subscribers/${encodeURIComponent(cleanId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to remove subscriber');
  return data;
}

export async function deactivateAdminSubscriber(
  telegramUserId: string,
  notes?: string
): Promise<{ success: boolean; message: string; subscriber: Subscriber }> {
  const token = getAdminToken();
  const cleanId = String(telegramUserId).trim();
  const res = await fetch(`/api/admin/subscribers/${encodeURIComponent(cleanId)}/deactivate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ notes }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to deactivate subscriber');
  return data;
}

export async function activateAdminSubscriber(
  telegramUserId: string,
  plan?: string
): Promise<{ success: boolean; message: string; subscriber: Subscriber }> {
  const token = getAdminToken();
  const cleanId = String(telegramUserId).trim();
  const res = await fetch(`/api/admin/subscribers/${encodeURIComponent(cleanId)}/activate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to activate subscriber');
  return data;
}


