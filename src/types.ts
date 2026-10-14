export type PlanType = 'None' | 'Normal' | 'Super';

export type SubscriptionStatus = 'Pending verification' | 'Active' | 'Expired' | 'None' | 'Deactivated';

export type PaymentStatus = 'Pending' | 'Approved' | 'Rejected';

export interface PlanConfig {
  id: 'Normal' | 'Super';
  name: string;
  price: number;
  currency: string;
  currencySymbol: string;
  durationDays: number;
  description: string;
  badge?: string;
}

export interface AppConfig {
  appName: string;
  upiId: string;
  payeeName: string;
  customQrCodeUrl?: string | null;
  qrInstructions?: string;
  adminContactTelegram: string;
  telegramBotUsername: string;
  isBotConfigured: boolean;
  isSupabaseConnected: boolean;
  databaseStatus?: 'connected' | 'schema_missing' | 'unconfigured' | 'local_dev';
  databaseMessage?: string;
  plans: PlanConfig[];
}

export interface AuditLog {
  id: string;
  action: string;
  target_user_id?: string | null;
  details?: Record<string, any>;
  created_at: string;
}

export interface Subscriber {
  telegram_user_id: string;
  username: string;
  first_name: string;
  last_name?: string;
  plan: PlanType;
  status: SubscriptionStatus;
  verified_expiry_date: string | null;
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
  proof_url: string;
  proof_mime_type: string;
  status: PaymentStatus;
  admin_notes?: string;
  submitted_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  new_expiry_date?: string | null;
}

export interface CsvImportResult {
  totalProcessed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}
