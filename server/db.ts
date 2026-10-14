import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Subscriber,
  PaymentSubmission,
  CsvImportResult,
  PlanType,
  SubscriptionStatus,
  PortalSettings,
  AuditLog,
} from './types.js';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

// Calculate 60-day renewal extension:
// "When approving a renewal, extend the subscription by 60 days from the later of today or the existing verified expiry date."
export function calculateRenewalExpiryDate(existingExpiryDate: string | null): string {
  const now = new Date();
  let baseTime = now.getTime();

  if (existingExpiryDate) {
    const existing = new Date(existingExpiryDate);
    if (!isNaN(existing.getTime()) && existing.getTime() > baseTime) {
      baseTime = existing.getTime();
    }
  }

  // Exactly 60 days = 60 * 24 * 60 * 60 * 1000 ms
  const newDate = new Date(baseTime + 60 * 86400000);
  return newDate.toISOString();
}

// Compute status based on verified_expiry_date
export function determineSubscriberStatus(verifiedExpiry: string | null): SubscriptionStatus {
  if (!verifiedExpiry) {
    return 'Pending verification';
  }
  const expiryTime = new Date(verifiedExpiry).getTime();
  if (isNaN(expiryTime)) {
    return 'Pending verification';
  }
  return expiryTime > Date.now() ? 'Active' : 'Expired';
}

interface LocalStoreData {
  subscribers: Subscriber[];
  payments: PaymentSubmission[];
  settings?: PortalSettings;
  audit_logs?: AuditLog[];
}

export type DatabaseStatus = 'connected' | 'schema_missing' | 'unconfigured' | 'local_dev';

export class DatabaseService {
  public supabase: SupabaseClient | null = null;
  public isUsingSupabase = false;
  public databaseStatus: DatabaseStatus = 'unconfigured';
  public databaseStatusMessage = '';
  public schemaReady = false;

  private localData: LocalStoreData = { subscribers: [], payments: [], audit_logs: [] };
  private isExplicitLocalMode = false;

  constructor() {
    const storageBackend = process.env.DATA_STORAGE_BACKEND;
    const isProduction = process.env.NODE_ENV === 'production';

    // Explicit local mode is ONLY allowed when explicitly configured and not forced to supabase
    if (storageBackend === 'local') {
      this.isExplicitLocalMode = true;
      this.databaseStatus = 'local_dev';
      this.databaseStatusMessage = 'Running in isolated local development mode (.data/store.json).';
      console.log('[Database] Running in explicitly configured local development mode.');
      this.initLocalStore();
      return;
    }

    // Default & Production: Supabase is authoritative
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey && supabaseUrl.startsWith('http')) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false },
        });
        this.isUsingSupabase = true;
        this.databaseStatus = 'connected';
        this.databaseStatusMessage = `Connected to Supabase PostgreSQL at ${supabaseUrl}`;
        console.log('[Database] Authoritative Supabase client initialized for:', supabaseUrl);

        // Run non-blocking schema check
        this.checkSchemaReadiness();
      } catch (err: any) {
        console.error('[Database] Failed to initialize Supabase client:', err);
        this.databaseStatus = 'unconfigured';
        this.databaseStatusMessage = `Supabase initialization failed: ${err.message}`;
      }
    } else {
      if (isProduction) {
        this.databaseStatus = 'unconfigured';
        this.databaseStatusMessage =
          'CRITICAL: Production database configuration missing. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.';
        console.error(`[Database Error] ${this.databaseStatusMessage}`);
      } else {
        // Fallback in dev only if no credentials present
        this.isExplicitLocalMode = true;
        this.databaseStatus = 'local_dev';
        this.databaseStatusMessage =
          'No Supabase credentials detected. Running in isolated local development mode.';
        console.warn(`[Database Warning] ${this.databaseStatusMessage}`);
        this.initLocalStore();
      }
    }
  }

  /**
   * Verify whether base tables (subscribers, payments, audit_logs) exist in Supabase
   */
  public async checkSchemaReadiness(): Promise<{ ready: boolean; error?: string }> {
    if (!this.supabase) {
      this.schemaReady = false;
      return { ready: false, error: 'Supabase client is not configured' };
    }

    try {
      const { data, error } = await this.supabase
        .from('subscribers')
        .select('telegram_user_id')
        .limit(1);

      if (error) {
        if (error.code === 'PGRST205') {
          // Table missing in public schema
          this.schemaReady = false;
          this.databaseStatus = 'schema_missing';
          this.databaseStatusMessage =
            "Database tables not found in Supabase public schema. Please run supabase_schema.sql in the Supabase SQL Editor to initialize base tables.";
          console.warn(`[Database Notice] ${this.databaseStatusMessage}`);
          return { ready: false, error: this.databaseStatusMessage };
        } else {
          this.schemaReady = false;
          this.databaseStatusMessage = `Supabase query error: ${error.message} [Code: ${error.code}]`;
          return { ready: false, error: this.databaseStatusMessage };
        }
      }

      this.schemaReady = true;
      this.databaseStatus = 'connected';
      this.databaseStatusMessage = 'Authoritative Supabase PostgreSQL tables verified and active.';
      return { ready: true };
    } catch (err: any) {
      this.schemaReady = false;
      this.databaseStatusMessage = `Schema verification exception: ${err.message}`;
      return { ready: false, error: this.databaseStatusMessage };
    }
  }

  /**
   * Guards all database calls against missing schema or missing configuration.
   * NEVER silently falls back to dummy data or local JSON in production!
   */
  private assertDatabaseReady(): void {
    if (this.isExplicitLocalMode) {
      return; // Local dev mode allowed
    }

    if (!this.supabase) {
      throw new Error(
        'Database configuration missing. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be provided for authoritative storage.'
      );
    }

    if (this.databaseStatus === 'schema_missing' || (!this.schemaReady && this.databaseStatusMessage.includes('PGRST205'))) {
      throw new Error(
        "Database tables not found in Supabase public schema. Please execute supabase_schema.sql in the Supabase SQL Editor to initialize base tables ('subscribers', 'payments', 'audit_logs', 'portal_settings')."
      );
    }
  }

  // --- LOCAL STORE MANAGEMENT (Strictly for isolated local development fixtures) ---
  // ZERO dummy data auto-seeding in production!

  private initLocalStore() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        try {
          const raw = fs.readFileSync(DATA_FILE, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            this.localData = {
              subscribers: Array.isArray(parsed.subscribers) ? parsed.subscribers : [],
              payments: Array.isArray(parsed.payments) ? parsed.payments : [],
              settings: parsed.settings,
              audit_logs: Array.isArray(parsed.audit_logs) ? parsed.audit_logs : [],
            };
          }
        } catch (readErr) {
          console.error('[Database] Error reading local store.json:', readErr);
        }
      } else {
        // Initialize cleanly with empty arrays - NO AUTOMATIC DUMMY DATA SEEDING
        this.localData = { subscribers: [], payments: [], audit_logs: [] };
        this.saveLocalStore();
      }
    } catch (e) {
      console.error('[Database] Failed to init local file store:', e);
    }
  }

  private reloadLocalStore() {
    if (!this.isExplicitLocalMode) return;
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.subscribers)) {
            this.localData.subscribers = parsed.subscribers;
          }
          if (Array.isArray(parsed.payments)) {
            this.localData.payments = parsed.payments;
          }
          if (parsed.settings) {
            this.localData.settings = parsed.settings;
          }
          if (Array.isArray(parsed.audit_logs)) {
            this.localData.audit_logs = parsed.audit_logs;
          }
        }
      }
    } catch (e) {
      console.error('[Database] Failed to reload local store file:', e);
    }
  }

  private saveLocalStore() {
    if (!this.isExplicitLocalMode) return;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.localData, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Database] Failed to write local store file:', e);
    }
  }

  // --- AUDIT LOGS ---

  async recordAuditLog(action: string, target_user_id?: string | null, details?: Record<string, any>): Promise<void> {
    const entry: AuditLog = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      action,
      target_user_id: target_user_id || null,
      details: details || {},
      created_at: new Date().toISOString(),
    };

    if (this.supabase && !this.isExplicitLocalMode) {
      try {
        await this.supabase.from('audit_logs').insert({
          action: entry.action,
          target_user_id: entry.target_user_id,
          details: entry.details,
          created_at: entry.created_at,
        });
      } catch (err) {
        console.error('[AuditLog] Failed to record audit log in Supabase:', err);
      }
    } else if (this.isExplicitLocalMode) {
      this.reloadLocalStore();
      if (!this.localData.audit_logs) this.localData.audit_logs = [];
      this.localData.audit_logs.unshift(entry);
      this.saveLocalStore();
    }
  }

  async getAuditLogs(limit: number = 50): Promise<AuditLog[]> {
    if (this.supabase && !this.isExplicitLocalMode) {
      this.assertDatabaseReady();
      const { data, error } = await this.supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Database error querying audit logs: ${error.message} [Code: ${error.code}]`);
      }
      return (data || []) as AuditLog[];
    }

    this.reloadLocalStore();
    return (this.localData.audit_logs || []).slice(0, limit);
  }

  // --- SUBSCRIBER OPERATIONS (AUTHORITATIVE) ---

  async getAllSubscribers(): Promise<Subscriber[]> {
    if (this.supabase && !this.isExplicitLocalMode) {
      this.assertDatabaseReady();
      const { data, error } = await this.supabase
        .from('subscribers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Supabase] getAllSubscribers error:', error);
        throw new Error(`Database error fetching subscribers: ${error.message} [Code: ${error.code}]`);
      }

      const list = (data || []) as Subscriber[];
      return list.map((sub) => {
        if (!sub.status) {
          sub.status = determineSubscriberStatus(sub.verified_expiry_date);
        }
        return sub;
      });
    }

    // Isolated local mode
    this.reloadLocalStore();
    return this.localData.subscribers.map((sub) => {
      if (!sub.status) {
        sub.status = determineSubscriberStatus(sub.verified_expiry_date);
      }
      return sub;
    });
  }

  async getSubscriberById(telegram_user_id: string): Promise<Subscriber | null> {
    const cleanId = String(telegram_user_id || '').trim();
    if (!cleanId) return null;

    if (this.supabase && !this.isExplicitLocalMode) {
      this.assertDatabaseReady();
      const { data, error } = await this.supabase
        .from('subscribers')
        .select('*')
        .eq('telegram_user_id', cleanId)
        .maybeSingle();

      if (error) {
        console.error('[Supabase] getSubscriberById error:', error);
        throw new Error(`Database error fetching subscriber (${cleanId}): ${error.message} [Code: ${error.code}]`);
      }

      if (!data) return null;
      const sub = data as Subscriber;
      if (!sub.status) {
        sub.status = determineSubscriberStatus(sub.verified_expiry_date);
      }
      return sub;
    }

    this.reloadLocalStore();
    const found = this.localData.subscribers.find((s) => String(s.telegram_user_id).trim() === cleanId);
    if (!found) return null;
    if (!found.status) {
      found.status = determineSubscriberStatus(found.verified_expiry_date);
    }
    return found;
  }

  async upsertSubscriber(subscriberData: Partial<Subscriber> & { telegram_user_id: string }): Promise<Subscriber> {
    const cleanId = String(subscriberData.telegram_user_id).trim();
    if (!cleanId) {
      throw new Error('Telegram User ID is required.');
    }
    const now = new Date().toISOString();

    const existing = await this.getSubscriberById(cleanId);

    const merged: Subscriber = {
      telegram_user_id: cleanId,
      username: (subscriberData.username !== undefined ? subscriberData.username : existing?.username ?? '').replace(/^@/, '').trim(),
      first_name: subscriberData.first_name ?? existing?.first_name ?? 'Member',
      last_name: subscriberData.last_name ?? existing?.last_name ?? '',
      plan: subscriberData.plan ?? existing?.plan ?? 'None',
      status: subscriberData.status ?? (existing ? existing.status : 'Pending verification'),
      verified_expiry_date:
        subscriberData.verified_expiry_date !== undefined
          ? subscriberData.verified_expiry_date
          : existing?.verified_expiry_date ?? null,
      created_at: subscriberData.created_at || existing?.created_at || now,
      updated_at: now,
      notes: subscriberData.notes ?? existing?.notes ?? '',
    };

    // If status was explicitly supplied by administrator, respect it
    if (subscriberData.status) {
      merged.status = subscriberData.status;
    } else if (merged.status !== 'Deactivated') {
      merged.status = determineSubscriberStatus(merged.verified_expiry_date);
    }

    // Authoritative write to Supabase
    if (this.supabase && !this.isExplicitLocalMode) {
      this.assertDatabaseReady();
      const { data, error } = await this.supabase
        .from('subscribers')
        .upsert(merged, { onConflict: 'telegram_user_id' })
        .select()
        .single();

      if (error) {
        console.error('[Supabase] upsertSubscriber error:', error);
        throw new Error(
          `Database error saving subscriber (${cleanId}): ${error.message} [Code: ${error.code || 'UNKNOWN'}]`
        );
      }

      if (!data) {
        throw new Error(`Database error saving subscriber (${cleanId}): No data returned from Supabase.`);
      }

      await this.recordAuditLog(existing ? 'UPDATE_SUBSCRIBER' : 'CREATE_SUBSCRIBER', cleanId, {
        plan: merged.plan,
        status: merged.status,
        verified_expiry_date: merged.verified_expiry_date,
      });

      return data as Subscriber;
    }

    // Local development mode
    this.reloadLocalStore();
    const idx = this.localData.subscribers.findIndex((s) => String(s.telegram_user_id).trim() === cleanId);
    if (idx >= 0) {
      this.localData.subscribers[idx] = merged;
    } else {
      this.localData.subscribers.unshift(merged);
    }
    this.saveLocalStore();
    return merged;
  }

  async updateSubscriberExpiry(telegram_user_id: string, newExpiryIso: string | null, plan?: PlanType): Promise<Subscriber | null> {
    const cleanId = String(telegram_user_id).trim();
    const sub = await this.getSubscriberById(cleanId);
    if (!sub) return null;

    sub.verified_expiry_date = newExpiryIso;
    sub.status = determineSubscriberStatus(newExpiryIso);
    if (plan && plan !== 'None') {
      sub.plan = plan;
    }
    sub.updated_at = new Date().toISOString();

    return await this.upsertSubscriber(sub);
  }

  async deactivateSubscriber(telegram_user_id: string, adminNotes?: string): Promise<Subscriber> {
    const cleanId = String(telegram_user_id || '').trim();
    if (!cleanId) {
      throw new Error('Telegram User ID is required.');
    }

    const sub = await this.getSubscriberById(cleanId);
    if (!sub) {
      throw new Error(`Subscriber ${cleanId} not found.`);
    }

    const now = new Date().toISOString();
    const dateStr = new Date().toLocaleDateString('en-IN');
    const deactivationNote = adminNotes
      ? `[Deactivated on ${dateStr}: ${adminNotes}]`
      : `[Deactivated by admin on ${dateStr}]`;

    sub.status = 'Deactivated';
    sub.verified_expiry_date = null;
    sub.notes = sub.notes ? `${sub.notes} | ${deactivationNote}` : deactivationNote;
    sub.updated_at = now;

    const result = await this.upsertSubscriber(sub);
    await this.recordAuditLog('DEACTIVATE_SUBSCRIBER', cleanId, { adminNotes });
    return result;
  }

  async activateSubscriber(telegram_user_id: string, plan?: PlanType): Promise<Subscriber> {
    const cleanId = String(telegram_user_id || '').trim();
    if (!cleanId) {
      throw new Error('Telegram User ID is required.');
    }

    const sub = await this.getSubscriberById(cleanId);
    if (!sub) {
      throw new Error(`Subscriber ${cleanId} not found.`);
    }

    const newExpiryIso = calculateRenewalExpiryDate(sub.verified_expiry_date);
    sub.status = 'Active';
    sub.verified_expiry_date = newExpiryIso;
    if (plan && plan !== 'None') {
      sub.plan = plan;
    } else if (sub.plan === 'None') {
      sub.plan = 'Normal';
    }
    sub.updated_at = new Date().toISOString();

    const result = await this.upsertSubscriber(sub);
    await this.recordAuditLog('ACTIVATE_SUBSCRIBER', cleanId, {
      plan: sub.plan,
      verified_expiry_date: newExpiryIso,
    });
    return result;
  }

  async deleteSubscriber(telegram_user_id: string): Promise<{ success: boolean; deletedUserId: string }> {
    const cleanId = String(telegram_user_id || '').trim();
    if (!cleanId) {
      throw new Error('Telegram User ID is required for removal.');
    }

    const existing = await this.getSubscriberById(cleanId);
    if (!existing) {
      throw new Error(`Subscriber with Telegram ID ${cleanId} not found.`);
    }

    if (this.supabase && !this.isExplicitLocalMode) {
      this.assertDatabaseReady();
      const { error } = await this.supabase
        .from('subscribers')
        .delete()
        .eq('telegram_user_id', cleanId);

      if (error) {
        console.error('[Supabase] deleteSubscriber error:', error);
        throw new Error(`Database error deleting subscriber (${cleanId}): ${error.message} [Code: ${error.code}]`);
      }

      await this.recordAuditLog('DELETE_SUBSCRIBER', cleanId, {
        username: existing.username,
        plan: existing.plan,
      });

      return { success: true, deletedUserId: cleanId };
    }

    // Local dev mode
    this.reloadLocalStore();
    this.localData.subscribers = this.localData.subscribers.filter(
      (s) => String(s.telegram_user_id).trim() !== cleanId
    );
    this.saveLocalStore();
    return { success: true, deletedUserId: cleanId };
  }

  // --- CSV IMPORT ---

  async importSubscribersFromCsv(
    records: Array<Record<string, string>>,
    mode: 'skip_existing' | 'merge_existing' = 'skip_existing'
  ): Promise<CsvImportResult> {
    const result: CsvImportResult = {
      totalProcessed: records.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    const existingMap = new Map<string, Subscriber>();
    const allCurrent = await this.getAllSubscribers();
    for (const sub of allCurrent) {
      existingMap.set(String(sub.telegram_user_id).trim(), sub);
    }

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rawId =
        row['telegram_user_id'] ||
        row['Telegram User ID'] ||
        row['Telegram ID'] ||
        row['user_id'] ||
        row['ID'] ||
        row['id'] ||
        row['telegram_id'];

      if (!rawId) {
        result.errors.push(`Row ${i + 1}: Missing Telegram User ID`);
        result.skipped++;
        continue;
      }

      const id = String(rawId).trim();
      const username = (
        row['username'] ||
        row['Username'] ||
        row['Telegram Username'] ||
        ''
      )
        .replace(/^@/, '')
        .trim();

      const firstName = (
        row['first_name'] ||
        row['First Name'] ||
        row['name'] ||
        row['Name'] ||
        username ||
        'Member'
      ).trim();

      const lastName = (row['last_name'] || row['Last Name'] || '').trim();

      const rawPlan = (row['plan'] || row['Plan'] || 'None').trim();
      let plan: PlanType = 'None';
      if (/super/i.test(rawPlan)) plan = 'Super';
      else if (/normal/i.test(rawPlan)) plan = 'Normal';

      const rawExpiry =
        row['verified_expiry_date'] ||
        row['expiry_date'] ||
        row['Expiry Date'] ||
        row['Expiry'] ||
        row['expiry'];

      let verifiedExpiry: string | null = null;
      if (rawExpiry && rawExpiry.trim() !== '' && !/pending|none|null/i.test(rawExpiry)) {
        const d = new Date(rawExpiry.trim());
        if (!isNaN(d.getTime())) {
          verifiedExpiry = d.toISOString();
        }
      }

      const notes = (row['notes'] || row['Notes'] || '').trim();
      const existing = existingMap.get(id);

      try {
        if (existing) {
          if (mode === 'skip_existing') {
            result.skipped++;
            continue;
          } else {
            const updatedSub = await this.upsertSubscriber({
              telegram_user_id: id,
              username: username || existing.username,
              first_name: firstName || existing.first_name,
              last_name: lastName || existing.last_name,
              plan: plan !== 'None' ? plan : existing.plan,
              verified_expiry_date: verifiedExpiry !== null ? verifiedExpiry : existing.verified_expiry_date,
              notes: notes ? `${existing.notes ? existing.notes + ' | ' : ''}${notes}` : existing.notes,
            });
            existingMap.set(id, updatedSub);
            result.updated++;
          }
        } else {
          const newSub = await this.upsertSubscriber({
            telegram_user_id: id,
            username,
            first_name: firstName,
            last_name: lastName,
            plan,
            verified_expiry_date: verifiedExpiry,
            notes,
          });
          existingMap.set(id, newSub);
          result.inserted++;
        }
      } catch (err: any) {
        result.errors.push(`Row ${i + 1} (${id}): ${err.message}`);
      }
    }

    return result;
  }

  // --- PAYMENT OPERATIONS (AUTHORITATIVE) ---

  async createPaymentSubmission(data: {
    telegram_user_id: string;
    username: string;
    first_name: string;
    plan: 'Normal' | 'Super';
    amount: number;
    utr?: string;
    proof_url: string;
    proof_mime_type?: string;
  }): Promise<PaymentSubmission> {
    const now = new Date().toISOString();
    const paymentId = 'pay_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    const submission: PaymentSubmission = {
      id: paymentId,
      telegram_user_id: String(data.telegram_user_id).trim(),
      username: (data.username || '').replace(/^@/, '').trim(),
      first_name: data.first_name || 'Member',
      plan: data.plan,
      amount: Number(data.amount) || (data.plan === 'Normal' ? 600 : 1000),
      utr: data.utr?.trim() || '',
      proof_url: data.proof_url,
      proof_mime_type: data.proof_mime_type || 'image/jpeg',
      status: 'Pending',
      admin_notes: '',
      submitted_at: now,
      reviewed_at: null,
      reviewed_by: null,
      new_expiry_date: null,
    };

    // Ensure subscriber record exists with pending verification
    await this.upsertSubscriber({
      telegram_user_id: submission.telegram_user_id,
      username: submission.username,
      first_name: submission.first_name,
      plan: submission.plan,
    });

    if (this.supabase && !this.isExplicitLocalMode) {
      this.assertDatabaseReady();
      const { data: inserted, error } = await this.supabase
        .from('payments')
        .insert(submission)
        .select()
        .single();

      if (error) {
        console.error('[Supabase] createPaymentSubmission error:', error);
        throw new Error(
          `Database error creating payment submission (${paymentId}): ${error.message} [Code: ${error.code}]`
        );
      }

      if (!inserted) {
        throw new Error(`Database error creating payment: No data returned from Supabase.`);
      }

      await this.recordAuditLog('CREATE_PAYMENT', submission.telegram_user_id, {
        paymentId,
        amount: submission.amount,
        plan: submission.plan,
      });

      return inserted as PaymentSubmission;
    }

    // Local dev mode
    this.reloadLocalStore();
    this.localData.payments.unshift(submission);
    this.saveLocalStore();
    return submission;
  }

  async getAllPayments(): Promise<PaymentSubmission[]> {
    if (this.supabase && !this.isExplicitLocalMode) {
      this.assertDatabaseReady();
      const { data, error } = await this.supabase
        .from('payments')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (error) {
        console.error('[Supabase] getAllPayments error:', error);
        throw new Error(`Database error fetching payments: ${error.message} [Code: ${error.code}]`);
      }

      return (data || []) as PaymentSubmission[];
    }

    this.reloadLocalStore();
    return [...this.localData.payments].sort(
      (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
    );
  }

  async getPaymentsByUserId(telegram_user_id: string): Promise<PaymentSubmission[]> {
    const cleanId = String(telegram_user_id || '').trim();
    if (!cleanId) return [];

    if (this.supabase && !this.isExplicitLocalMode) {
      this.assertDatabaseReady();
      const { data, error } = await this.supabase
        .from('payments')
        .select('*')
        .eq('telegram_user_id', cleanId)
        .order('submitted_at', { ascending: false });

      if (error) {
        throw new Error(`Database error fetching payments for user (${cleanId}): ${error.message}`);
      }

      return (data || []) as PaymentSubmission[];
    }

    this.reloadLocalStore();
    return this.localData.payments.filter((p) => String(p.telegram_user_id).trim() === cleanId);
  }

  async getPaymentById(id: string): Promise<PaymentSubmission | null> {
    if (!id) return null;
    const cleanId = String(id).trim();

    if (this.supabase && !this.isExplicitLocalMode) {
      this.assertDatabaseReady();
      const { data, error } = await this.supabase
        .from('payments')
        .select('*')
        .eq('id', cleanId)
        .maybeSingle();

      if (error) {
        console.error('[Supabase] getPaymentById error:', error);
        throw new Error(`Database error fetching payment (${cleanId}): ${error.message} [Code: ${error.code}]`);
      }

      return data ? (data as PaymentSubmission) : null;
    }

    this.reloadLocalStore();
    const found = this.localData.payments.find((p) => String(p.id).trim() === cleanId);
    return found || null;
  }

  /**
   * Approves a payment and activates / extends subscription:
   * "When approving a renewal, extend the subscription by 60 days from the later of today or the existing verified expiry date."
   * Prevents duplicate approvals and duplicate renewals if the admin clicks twice.
   */
  async approvePayment(
    paymentId: string,
    adminNotes: string = '',
    reviewedBy: string = 'Admin'
  ): Promise<{ payment: PaymentSubmission; subscriber: Subscriber }> {
    const cleanPaymentId = String(paymentId || '').trim();
    if (!cleanPaymentId) {
      throw new Error('Payment ID is required.');
    }

    const payment = await this.getPaymentById(cleanPaymentId);
    if (!payment) {
      throw new Error(`Payment ${cleanPaymentId} not found`);
    }

    // STRICT GUARD: Prevent duplicate approvals
    if (payment.status === 'Approved') {
      throw new Error(`Payment ${cleanPaymentId} has already been approved.`);
    }

    // Retrieve subscriber record
    let subscriber = await this.getSubscriberById(payment.telegram_user_id);
    if (!subscriber) {
      subscriber = await this.upsertSubscriber({
        telegram_user_id: payment.telegram_user_id,
        username: payment.username || '',
        first_name: payment.first_name || 'Member',
        plan: payment.plan,
        status: 'Pending verification',
        verified_expiry_date: null,
      });
    }

    // Compute new 60-day expiry date
    const newExpiryIso = calculateRenewalExpiryDate(subscriber.verified_expiry_date);

    // Update subscriber plan and verified expiry date (throws if fails)
    const updatedSubscriber = await this.updateSubscriberExpiry(
      subscriber.telegram_user_id,
      newExpiryIso,
      payment.plan
    );

    const now = new Date().toISOString();
    const updatedPaymentFields: Partial<PaymentSubmission> = {
      status: 'Approved',
      admin_notes: adminNotes || payment.admin_notes || '',
      reviewed_at: now,
      reviewed_by: reviewedBy,
      new_expiry_date: newExpiryIso,
    };

    if (this.supabase && !this.isExplicitLocalMode) {
      this.assertDatabaseReady();
      const { data: updatedPay, error: payError } = await this.supabase
        .from('payments')
        .update(updatedPaymentFields)
        .eq('id', cleanPaymentId)
        .select()
        .single();

      if (payError) {
        console.error('[Supabase] approvePayment error updating Supabase:', payError);
        throw new Error(
          `Database error updating payment status (${cleanPaymentId}): ${payError.message} [Code: ${payError.code}]`
        );
      }

      await this.recordAuditLog('APPROVE_PAYMENT', payment.telegram_user_id, {
        paymentId: cleanPaymentId,
        new_expiry_date: newExpiryIso,
        plan: payment.plan,
        reviewed_by: reviewedBy,
      });

      return {
        payment: updatedPay as PaymentSubmission,
        subscriber: updatedSubscriber || subscriber,
      };
    }

    // Local dev mode
    this.reloadLocalStore();
    const idx = this.localData.payments.findIndex((p) => String(p.id).trim() === cleanPaymentId);
    const updatedPay: PaymentSubmission = {
      ...payment,
      ...updatedPaymentFields,
    };
    if (idx >= 0) {
      this.localData.payments[idx] = updatedPay;
    }
    this.saveLocalStore();

    return {
      payment: updatedPay,
      subscriber: updatedSubscriber || subscriber,
    };
  }

  async rejectPayment(
    paymentId: string,
    adminNotes: string = '',
    reviewedBy: string = 'Admin'
  ): Promise<PaymentSubmission> {
    const cleanPaymentId = String(paymentId || '').trim();
    if (!cleanPaymentId) {
      throw new Error('Payment ID is required.');
    }

    const payment = await this.getPaymentById(cleanPaymentId);
    if (!payment) {
      throw new Error(`Payment ${cleanPaymentId} not found`);
    }

    if (payment.status === 'Approved') {
      throw new Error(`Cannot reject payment ${cleanPaymentId} because it has already been approved.`);
    }
    if (payment.status === 'Rejected') {
      throw new Error(`Payment ${cleanPaymentId} has already been rejected.`);
    }

    const now = new Date().toISOString();
    const updatedPaymentFields: Partial<PaymentSubmission> = {
      status: 'Rejected',
      admin_notes: adminNotes || payment.admin_notes || '',
      reviewed_at: now,
      reviewed_by: reviewedBy,
    };

    if (this.supabase && !this.isExplicitLocalMode) {
      this.assertDatabaseReady();
      const { data: updatedPay, error: payError } = await this.supabase
        .from('payments')
        .update(updatedPaymentFields)
        .eq('id', cleanPaymentId)
        .select()
        .single();

      if (payError) {
        console.error('[Supabase] rejectPayment error updating Supabase:', payError);
        throw new Error(
          `Database error rejecting payment (${cleanPaymentId}): ${payError.message} [Code: ${payError.code}]`
        );
      }

      await this.recordAuditLog('REJECT_PAYMENT', payment.telegram_user_id, {
        paymentId: cleanPaymentId,
        reviewed_by: reviewedBy,
      });

      return updatedPay as PaymentSubmission;
    }

    // Local dev mode
    this.reloadLocalStore();
    const idx = this.localData.payments.findIndex((p) => String(p.id).trim() === cleanPaymentId);
    const updatedPay: PaymentSubmission = {
      ...payment,
      ...updatedPaymentFields,
    };
    if (idx >= 0) {
      this.localData.payments[idx] = updatedPay;
    }
    this.saveLocalStore();

    return updatedPay;
  }

  // --- PORTAL & QR SETTINGS ---

  async getPortalSettings(): Promise<PortalSettings> {
    const defaultSettings: PortalSettings = {
      customQrCodeUrl: null,
      upiId: process.env.UPI_ID || 'tharak4321@slc',
      payeeName: process.env.UPI_PAYEE_NAME || 'Actorsparadise',
      qrInstructions: 'Scan Slice UPI QR to pay directly from any UPI App',
    };

    if (this.supabase && !this.isExplicitLocalMode) {
      try {
        const { data, error } = await this.supabase
          .from('portal_settings')
          .select('*')
          .eq('id', 'global')
          .maybeSingle();

        if (!error && data) {
          return {
            customQrCodeUrl: data.custom_qr_code_url ?? null,
            upiId: data.upi_id || defaultSettings.upiId,
            payeeName: data.payee_name || defaultSettings.payeeName,
            qrInstructions: data.qr_instructions || defaultSettings.qrInstructions,
            updatedAt: data.updated_at,
          };
        }
      } catch (e) {
        // Fall back to default
      }
    }

    if (this.isExplicitLocalMode) {
      this.reloadLocalStore();
      if (this.localData.settings) {
        return {
          ...defaultSettings,
          ...this.localData.settings,
        };
      }
    }

    return defaultSettings;
  }

  async updatePortalSettings(partial: Partial<PortalSettings>): Promise<PortalSettings> {
    const current = await this.getPortalSettings();
    const updated: PortalSettings = {
      ...current,
      ...partial,
      updatedAt: new Date().toISOString(),
    };

    if (this.supabase && !this.isExplicitLocalMode) {
      this.assertDatabaseReady();
      const { error } = await this.supabase.from('portal_settings').upsert({
        id: 'global',
        custom_qr_code_url: updated.customQrCodeUrl,
        upi_id: updated.upiId,
        payee_name: updated.payeeName,
        qr_instructions: updated.qrInstructions,
        updated_at: updated.updatedAt,
      });

      if (error) {
        console.error('[Supabase] Failed to update portal settings:', error);
        throw new Error(`Database error updating settings: ${error.message} [Code: ${error.code}]`);
      }

      await this.recordAuditLog('UPDATE_SETTINGS', 'global', {
        upiId: updated.upiId,
        payeeName: updated.payeeName,
      });

      return updated;
    }

    this.reloadLocalStore();
    this.localData.settings = updated;
    this.saveLocalStore();
    return updated;
  }
}

export const db = new DatabaseService();
