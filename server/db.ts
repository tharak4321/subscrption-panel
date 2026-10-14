import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Subscriber, PaymentSubmission, CsvImportResult, PlanType, SubscriptionStatus, PortalSettings } from './types.js';

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
}

export class DatabaseService {
  private supabase: SupabaseClient | null = null;
  private localData: LocalStoreData = { subscribers: [], payments: [] };
  public isUsingSupabase = false;

  constructor() {
    // 1. ALWAYS load local store first so in-memory store and file cache are ready
    this.initLocalStore();

    // 2. Initialize Supabase if configured
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey && supabaseUrl.startsWith('http')) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false },
        });
        this.isUsingSupabase = true;
        console.log('[Database] Connected to Supabase PostgreSQL at', supabaseUrl);
      } catch (err) {
        console.error('[Database] Failed to initialize Supabase client:', err);
      }
    } else {
      console.log('[Database] Supabase credentials not detected; using persistent local storage.');
    }
  }

  private initLocalStore() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      let loadedExisting = false;
      if (fs.existsSync(DATA_FILE)) {
        try {
          const raw = fs.readFileSync(DATA_FILE, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            this.localData = {
              subscribers: Array.isArray(parsed.subscribers) ? parsed.subscribers : [],
              payments: Array.isArray(parsed.payments) ? parsed.payments : [],
              settings: parsed.settings,
            };
            loadedExisting = true;
          }
        } catch (readErr) {
          console.error('[Database] Error reading existing store.json:', readErr);
        }
      }

      // If subscribers or payments are empty, seed default data to ensure a functional starting state
      const now = new Date();
      const futureDate = new Date(now.getTime() + 45 * 86400000).toISOString();
      const pastDate = new Date(now.getTime() - 10 * 86400000).toISOString();

      let needsSave = !loadedExisting;

      if (!this.localData.subscribers || this.localData.subscribers.length === 0) {
        this.localData.subscribers = [
          {
            telegram_user_id: '884129402',
            username: 'dragonbreath1',
            first_name: 'Dragon',
            last_name: 'Breath',
            plan: 'Super',
            status: 'Active',
            verified_expiry_date: futureDate,
            notes: 'Primary admin contact and active VIP subscriber',
            created_at: new Date(now.getTime() - 60 * 86400000).toISOString(),
            updated_at: now.toISOString(),
          },
          {
            telegram_user_id: '992144319',
            username: 'rahul_actor',
            first_name: 'Rahul',
            last_name: 'Verma',
            plan: 'Normal',
            status: 'Active',
            verified_expiry_date: new Date(now.getTime() + 18 * 86400000).toISOString(),
            notes: 'Regular member',
            created_at: new Date(now.getTime() - 42 * 86400000).toISOString(),
            updated_at: now.toISOString(),
          },
          {
            telegram_user_id: '773091224',
            username: 'kavitha_m',
            first_name: 'Kavitha',
            last_name: '',
            plan: 'Normal',
            status: 'Pending verification',
            verified_expiry_date: null,
            notes: 'Awaiting payment verification',
            created_at: new Date(now.getTime() - 2 * 86400000).toISOString(),
            updated_at: now.toISOString(),
          },
          {
            telegram_user_id: '661902844',
            username: 'vikram_cine',
            first_name: 'Vikram',
            last_name: 'Kumar',
            plan: 'Super',
            status: 'Expired',
            verified_expiry_date: pastDate,
            notes: 'Expired 10 days ago',
            created_at: new Date(now.getTime() - 70 * 86400000).toISOString(),
            updated_at: pastDate,
          },
        ];
        needsSave = true;
      }

      if (!this.localData.payments || this.localData.payments.length === 0) {
        this.localData.payments = [
          {
            id: 'pay_demo_001',
            telegram_user_id: '773091224',
            username: 'kavitha_m',
            first_name: 'Kavitha',
            plan: 'Normal',
            amount: 600,
            utr: '428901239841',
            proof_url: '',
            proof_mime_type: 'image/jpeg',
            status: 'Pending',
            admin_notes: '',
            submitted_at: new Date(now.getTime() - 3600000).toISOString(),
          },
          {
            id: 'pay_demo_002',
            telegram_user_id: '884129402',
            username: 'dragonbreath1',
            first_name: 'Dragon',
            plan: 'Super',
            amount: 1000,
            utr: '421890334812',
            proof_url: '',
            proof_mime_type: 'image/jpeg',
            status: 'Approved',
            admin_notes: 'Verified via Slice app transfer',
            submitted_at: new Date(now.getTime() - 15 * 86400000).toISOString(),
            reviewed_at: new Date(now.getTime() - 15 * 86400000).toISOString(),
            reviewed_by: 'Admin',
            new_expiry_date: futureDate,
          },
        ];
        needsSave = true;
      }

      if (needsSave) {
        this.saveLocalStore();
      }
    } catch (e) {
      console.error('[Database] Failed to init local file store:', e);
    }
  }

  private reloadLocalStore() {
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
        }
      }
    } catch (e) {
      console.error('[Database] Failed to reload local store file:', e);
    }
  }

  private saveLocalStore() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.localData, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Database] Failed to write local store file:', e);
    }
  }

  // --- SUBSCRIBER OPERATIONS ---

  async getAllSubscribers(): Promise<Subscriber[]> {
    this.reloadLocalStore();
    const subscriberMap = new Map<string, Subscriber>();

    // 1. Populate from local data
    for (const sub of this.localData.subscribers) {
      if (sub && sub.telegram_user_id) {
        const cleanId = String(sub.telegram_user_id).trim();
        subscriberMap.set(cleanId, { ...sub, telegram_user_id: cleanId });
      }
    }

    // 2. Query Supabase if configured and merge
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('subscribers')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[Supabase] getAllSubscribers error:', error);
        } else if (Array.isArray(data)) {
          for (const s of data) {
            if (s && s.telegram_user_id) {
              const cleanId = String(s.telegram_user_id).trim();
              const existing = subscriberMap.get(cleanId);
              subscriberMap.set(cleanId, {
                ...existing,
                ...s,
                telegram_user_id: cleanId,
              });
            }
          }
        }
      } catch (err) {
        console.error('[Supabase] getAllSubscribers exception:', err);
      }
    }

    // Preserve stored status for all subscribers without automatic overwrite
    const list = Array.from(subscriberMap.values());
    return list.map((sub) => {
      if (!sub.status) {
        sub.status = determineSubscriberStatus(sub.verified_expiry_date);
      }
      return sub;
    });
  }

  async getSubscriberById(telegram_user_id: string): Promise<Subscriber | null> {
    const cleanId = String(telegram_user_id || '').trim();
    if (!cleanId) return null;

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('subscribers')
          .select('*')
          .eq('telegram_user_id', cleanId)
          .maybeSingle();

        if (!error && data) {
          const sub = data as Subscriber;
          if (!sub.status) {
            sub.status = determineSubscriberStatus(sub.verified_expiry_date);
          }
          return sub;
        }
      } catch (err) {
        console.error('[Supabase] getSubscriberById exception:', err);
      }
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
    const now = new Date().toISOString();

    const existing = await this.getSubscriberById(cleanId);

    const merged: Subscriber = {
      telegram_user_id: cleanId,
      username: subscriberData.username ?? existing?.username ?? '',
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
    };

    // If status was explicitly supplied by administrator (e.g. 'Active', 'Expired', 'Pending verification', 'Deactivated'),
    // RESPECT the administrator's explicit choice!
    if (subscriberData.status) {
      merged.status = subscriberData.status;
    } else if (merged.status !== 'Deactivated') {
      merged.status = determineSubscriberStatus(merged.verified_expiry_date);
    }

    // 1. Update in local store
    this.reloadLocalStore();
    const idx = this.localData.subscribers.findIndex((s) => String(s.telegram_user_id).trim() === cleanId);
    if (idx >= 0) {
      this.localData.subscribers[idx] = merged;
    } else {
      this.localData.subscribers.unshift(merged);
    }
    this.saveLocalStore();

    // 2. Upsert in Supabase if enabled
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('subscribers')
          .upsert(merged, { onConflict: 'telegram_user_id' })
          .select()
          .maybeSingle();

        if (error) {
          console.error('[Supabase] upsertSubscriber error:', error);
        } else if (data) {
          return data as Subscriber;
        }
      } catch (err) {
        console.error('[Supabase] upsertSubscriber exception:', err);
      }
    }

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

  /**
   * Deactivates a subscriber:
   * Sets status to 'Deactivated', clears active expiry, and appends notes.
   * Preserves all payment and renewal history!
   */
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

    // 1. Update in local store
    this.reloadLocalStore();
    const idx = this.localData.subscribers.findIndex((s) => String(s.telegram_user_id).trim() === cleanId);
    if (idx >= 0) {
      this.localData.subscribers[idx] = sub;
    } else {
      this.localData.subscribers.unshift(sub);
    }
    this.saveLocalStore();

    // 2. Update in Supabase if configured
    if (this.supabase) {
      try {
        await this.supabase
          .from('subscribers')
          .upsert(sub, { onConflict: 'telegram_user_id' });
      } catch (err) {
        console.error('[Supabase] deactivateSubscriber exception:', err);
      }
    }

    return sub;
  }

  /**
   * Reactivates a subscriber:
   * Extends or activates 60-day subscription.
   */
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

    return await this.upsertSubscriber(sub);
  }

  /**
   * Permanently removes an explicitly selected subscriber:
   * Targets ONLY this subscriber. Never clears or resets the database.
   * Completely preserves all payment submissions, proof screenshots, and renewal history!
   */
  async deleteSubscriber(telegram_user_id: string): Promise<{ success: boolean; deletedUserId: string }> {
    const cleanId = String(telegram_user_id || '').trim();
    if (!cleanId) {
      throw new Error('Telegram User ID is required for removal.');
    }

    this.reloadLocalStore();
    const existingIndex = this.localData.subscribers.findIndex(
      (s) => String(s.telegram_user_id).trim() === cleanId
    );

    if (existingIndex === -1) {
      throw new Error(`Subscriber with Telegram ID ${cleanId} not found.`);
    }

    // Safety check: Remove ONLY the target subscriber, preserving all others
    this.localData.subscribers = this.localData.subscribers.filter(
      (s) => String(s.telegram_user_id).trim() !== cleanId
    );
    this.saveLocalStore();

    // 2. Remove from Supabase if configured
    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('subscribers')
          .delete()
          .eq('telegram_user_id', cleanId);
        if (error) {
          console.error('[Supabase] deleteSubscriber error:', error);
        }
      } catch (err) {
        console.error('[Supabase] deleteSubscriber exception:', err);
      }
    }

    return { success: true, deletedUserId: cleanId };
  }

  // --- CSV IMPORT (WITH PRESERVATION & DUPLICATE PREVENTION) ---

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
      // Normalize column names
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

      if (existing) {
        if (mode === 'skip_existing') {
          // Rule: "Preserve existing subscriber records and prevent duplicate imports"
          result.skipped++;
          continue;
        } else {
          // Merge mode: Only update fields if not already active/verified
          const updatedSub = await this.upsertSubscriber({
            telegram_user_id: id,
            username: username || existing.username,
            first_name: firstName || existing.first_name,
            plan: plan !== 'None' ? plan : existing.plan,
            verified_expiry_date: verifiedExpiry || existing.verified_expiry_date,
            notes: notes ? `${existing.notes ? existing.notes + ' | ' : ''}${notes}` : existing.notes,
          });
          existingMap.set(id, updatedSub);
          result.updated++;
        }
      } else {
        // Insert new subscriber
        const newSub = await this.upsertSubscriber({
          telegram_user_id: id,
          username,
          first_name: firstName,
          plan,
          verified_expiry_date: verifiedExpiry,
          notes,
        });
        existingMap.set(id, newSub);
        result.inserted++;
      }
    }

    return result;
  }

  // --- PAYMENT OPERATIONS ---

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
    // Payment IDs are exact alphanumeric strings starting with pay_
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
      status: 'Pending', // Strictly pending initially
      admin_notes: '',
      submitted_at: now,
      reviewed_at: null,
      reviewed_by: null,
    };

    // Ensure subscriber record exists (with pending status, no automatic activation)
    await this.upsertSubscriber({
      telegram_user_id: submission.telegram_user_id,
      username: submission.username,
      first_name: submission.first_name,
      plan: submission.plan,
    });

    // 1. ALWAYS persist in local store
    this.reloadLocalStore();
    const existingIdx = this.localData.payments.findIndex((p) => String(p.id).trim() === paymentId);
    if (existingIdx >= 0) {
      this.localData.payments[existingIdx] = submission;
    } else {
      this.localData.payments.unshift(submission);
    }
    this.saveLocalStore();

    // 2. Also insert into Supabase if configured
    if (this.supabase) {
      try {
        const { data: inserted, error } = await this.supabase
          .from('payments')
          .upsert(submission, { onConflict: 'id' })
          .select()
          .maybeSingle();

        if (error) {
          console.error('[Supabase] createPaymentSubmission error:', error);
        } else if (inserted) {
          return inserted as PaymentSubmission;
        }
      } catch (err) {
        console.error('[Supabase] createPaymentSubmission exception:', err);
      }
    }

    return submission;
  }

  async getAllPayments(): Promise<PaymentSubmission[]> {
    this.reloadLocalStore();
    const paymentMap = new Map<string, PaymentSubmission>();

    // 1. Populate from local store first
    for (const p of this.localData.payments) {
      if (p && p.id) {
        const cleanId = String(p.id).trim();
        paymentMap.set(cleanId, {
          ...p,
          id: cleanId,
          telegram_user_id: String(p.telegram_user_id).trim(),
          amount: Number(p.amount),
        });
      }
    }

    // 2. Query Supabase if available and merge
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('payments')
          .select('*')
          .order('submitted_at', { ascending: false });

        if (error) {
          console.error('[Supabase] getAllPayments error:', error);
        } else if (Array.isArray(data)) {
          for (const p of data) {
            if (p && p.id) {
              const cleanId = String(p.id).trim();
              const existing = paymentMap.get(cleanId);
              paymentMap.set(cleanId, {
                ...existing,
                ...p,
                id: cleanId,
                telegram_user_id: String(p.telegram_user_id).trim(),
                amount: Number(p.amount),
              });
            }
          }
        }
      } catch (err) {
        console.error('[Supabase] getAllPayments exception:', err);
      }
    }

    const list = Array.from(paymentMap.values());
    list.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
    return list;
  }

  async getPaymentsByUserId(telegram_user_id: string): Promise<PaymentSubmission[]> {
    const cleanId = String(telegram_user_id || '').trim();
    if (!cleanId) return [];

    const all = await this.getAllPayments();
    return all.filter((p) => String(p.telegram_user_id).trim() === cleanId);
  }

  async getPaymentById(id: string): Promise<PaymentSubmission | null> {
    if (!id) return null;
    // Strict exact string comparison, no numeric casting
    const cleanId = String(id).trim();

    // 1. Query Supabase if configured
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('payments')
          .select('*')
          .eq('id', cleanId)
          .maybeSingle();

        if (!error && data) {
          const formatted: PaymentSubmission = {
            id: cleanId,
            telegram_user_id: String(data.telegram_user_id).trim(),
            username: data.username || '',
            first_name: data.first_name || 'Member',
            plan: data.plan,
            amount: Number(data.amount),
            utr: data.utr || '',
            proof_url: data.proof_url || '',
            proof_mime_type: data.proof_mime_type || 'image/jpeg',
            status: data.status,
            admin_notes: data.admin_notes || '',
            submitted_at: data.submitted_at,
            reviewed_at: data.reviewed_at || null,
            reviewed_by: data.reviewed_by || null,
            new_expiry_date: data.new_expiry_date || null,
          };
          return formatted;
        }
        if (error && error.code !== 'PGRST116') {
          console.error('[Supabase] getPaymentById error:', error);
        }
      } catch (err) {
        console.error('[Supabase] getPaymentById exception:', err);
      }
    }

    // 2. Query in-memory local data
    const inMemory = this.localData.payments.find((p) => String(p.id).trim() === cleanId);
    if (inMemory) {
      return inMemory;
    }

    // 3. Reload from disk in case updated by another worker/request
    this.reloadLocalStore();
    const onDisk = this.localData.payments.find((p) => String(p.id).trim() === cleanId);
    if (onDisk) {
      return onDisk;
    }

    return null;
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

    // Guard: Prevent duplicate approvals and duplicate renewals if clicked twice
    if (payment.status === 'Approved') {
      throw new Error(`Payment ${cleanPaymentId} has already been approved.`);
    }

    // Retrieve or initialize subscriber record
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

    // Compute new 60-day expiry using the rule:
    // "When approving a renewal, extend the subscription by 60 days from the later of today or the existing verified expiry date."
    const newExpiryIso = calculateRenewalExpiryDate(subscriber.verified_expiry_date);

    // Update subscriber plan and verified expiry date
    const updatedSubscriber = await this.updateSubscriberExpiry(
      subscriber.telegram_user_id,
      newExpiryIso,
      payment.plan
    );

    const now = new Date().toISOString();
    payment.status = 'Approved';
    payment.admin_notes = adminNotes;
    payment.reviewed_at = now;
    payment.reviewed_by = reviewedBy;
    payment.new_expiry_date = newExpiryIso;

    // 1. Update in local store
    this.reloadLocalStore();
    const idx = this.localData.payments.findIndex((p) => String(p.id).trim() === cleanPaymentId);
    if (idx >= 0) {
      this.localData.payments[idx] = payment;
    } else {
      this.localData.payments.unshift(payment);
    }
    this.saveLocalStore();

    // 2. Upsert in Supabase if enabled
    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('payments')
          .upsert(payment, { onConflict: 'id' });
        if (error) {
          console.error('[Supabase] approvePayment error updating Supabase:', error);
        }
      } catch (err) {
        console.error('[Supabase] approvePayment exception:', err);
      }
    }

    return { payment, subscriber: updatedSubscriber || subscriber };
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
    payment.status = 'Rejected';
    payment.admin_notes = adminNotes;
    payment.reviewed_at = now;
    payment.reviewed_by = reviewedBy;

    // 1. Update in local store
    this.reloadLocalStore();
    const idx = this.localData.payments.findIndex((p) => String(p.id).trim() === cleanPaymentId);
    if (idx >= 0) {
      this.localData.payments[idx] = payment;
    } else {
      this.localData.payments.unshift(payment);
    }
    this.saveLocalStore();

    // 2. Upsert in Supabase if enabled
    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('payments')
          .upsert(payment, { onConflict: 'id' });
        if (error) {
          console.error('[Supabase] rejectPayment error updating Supabase:', error);
        }
      } catch (err) {
        console.error('[Supabase] rejectPayment exception:', err);
      }
    }

    return payment;
  }

  // --- PORTAL & QR SETTINGS ---

  async getPortalSettings(): Promise<PortalSettings> {
    const defaultSettings: PortalSettings = {
      customQrCodeUrl: null,
      upiId: process.env.UPI_ID || 'tharak4321@slc',
      payeeName: process.env.UPI_PAYEE_NAME || 'Actorsparadise',
      qrInstructions: 'Scan Slice UPI QR to pay directly from any UPI App',
    };

    if (this.supabase) {
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
        // Fallback
      }
    }

    this.reloadLocalStore();
    if (this.localData.settings) {
      return {
        ...defaultSettings,
        ...this.localData.settings,
      };
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

    if (this.supabase) {
      try {
        await this.supabase.from('portal_settings').upsert({
          id: 'global',
          custom_qr_code_url: updated.customQrCodeUrl,
          upi_id: updated.upiId,
          payee_name: updated.payeeName,
          qr_instructions: updated.qrInstructions,
          updated_at: updated.updatedAt,
        });
      } catch (err) {
        console.error('[Supabase] Failed to update portal settings in Supabase:', err);
      }
    }

    this.reloadLocalStore();
    this.localData.settings = updated;
    this.saveLocalStore();
    return updated;
  }
}

export const db = new DatabaseService();
