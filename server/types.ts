export type PlanType = 'None' | 'Normal' | 'Super';

export type SubscriptionStatus = 'Pending verification' | 'Active' | 'Expired' | 'None' | 'Deactivated';

export type PaymentStatus = 'Pending' | 'Approved' | 'Rejected';

export interface Subscriber {
  telegram_user_id: string;
  username: string;
  first_name: string;
  last_name?: string;
  plan: PlanType;
  status: SubscriptionStatus;
  verified_expiry_date: string | null; // ISO string or null
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentSubmission {
  id: string;
  telegram_user_id: string;
  username: string;
  first_name: string;
  plan: 'Normal' | 'Super';
  amount: number;
  utr?: string;
  proof_url: string; // Base64 data URI or Supabase Storage URL
  proof_mime_type: string;
  status: PaymentStatus;
  admin_notes?: string;
  submitted_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  new_expiry_date?: string | null;
}

export interface TelegramAuthPayload {
  id: number | string;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash?: string;
}

export interface AdminSession {
  token: string;
  createdAt: number;
  expiresAt: number;
}

export interface CsvImportResult {
  totalProcessed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface PortalSettings {
  customQrCodeUrl: string | null;
  upiId: string;
  payeeName: string;
  qrInstructions?: string;
  updatedAt?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  target_user_id?: string | null;
  details?: Record<string, any>;
  created_at: string;
}

