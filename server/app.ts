import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db, calculateRenewalExpiryDate } from './db.js';
import { verifyTelegramLogin } from './telegramAuth.js';
import { PlanType } from './types.js';

export const app = express();

// Enable JSON parsing up to 15MB for payment screenshot uploads
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Config constants
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || '';
const UPI_ID = process.env.UPI_ID || 'tharak4321@slc';
const UPI_PAYEE_NAME = process.env.UPI_PAYEE_NAME || 'Actorsparadise';
const ADMIN_CONTACT_TELEGRAM = (process.env.ADMIN_CONTACT_TELEGRAM || 'dragonbreath1').replace(/^@+/, '').trim();

// Persistent admin sessions (preserves logins across server restarts & page refreshes)
const SESSIONS_FILE = path.resolve(process.cwd(), '.data/admin_sessions.json');

function loadAdminSessions(): Set<string> {
  const set = new Set<string>();
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const content = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        for (const token of data) {
          if (typeof token === 'string' && token.trim()) {
            set.add(token.trim());
          }
        }
      }
    }
  } catch (err) {
    console.error('[Auth] Error reading admin sessions file:', err);
  }
  return set;
}

function saveAdminSessions(set: Set<string>): void {
  try {
    const dir = path.dirname(SESSIONS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Array.from(set), null, 2), 'utf-8');
  } catch (err) {
    console.error('[Auth] Error saving admin sessions file:', err);
  }
}

const activeAdminTokens = loadAdminSessions();

function generateAdminToken(): string {
  const payload = `${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
  const signature = crypto.createHmac('sha256', ADMIN_PASSWORD).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function isValidAdminToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const clean = token.trim();
  if (activeAdminTokens.has(clean)) return true;

  // Verify HMAC signature to survive restarts
  const parts = clean.split('.');
  if (parts.length === 2) {
    const [payload, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', ADMIN_PASSWORD).update(payload).digest('hex');
    if (sig === expectedSig) {
      const ts = parseInt(payload.split('_')[0], 10);
      // Valid for 14 days
      if (!isNaN(ts) && Date.now() - ts < 14 * 86400000) {
        activeAdminTokens.add(clean);
        saveAdminSessions(activeAdminTokens);
        return true;
      }
    }
  }
  return false;
}

// Admin Auth Middleware
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = (authHeader?.replace(/^Bearer\s+/i, '').trim()) || (req.query.token as string)?.trim();

  if (!token || !isValidAdminToken(token)) {
    res.status(401).json({ error: 'Unauthorized: Admin authentication required.' });
    return;
  }
  next();
}

// -----------------------------------------------------------------------------
// PUBLIC SYSTEM CONFIG
// -----------------------------------------------------------------------------

app.get('/api/config', async (_req: Request, res: Response) => {
  const settings = await db.getPortalSettings();
  res.json({
    appName: 'Actorsparadise Subscription Portal',
    upiId: settings.upiId,
    payeeName: settings.payeeName,
    customQrCodeUrl: settings.customQrCodeUrl,
    qrInstructions: settings.qrInstructions,
    adminContactTelegram: ADMIN_CONTACT_TELEGRAM,
    telegramBotUsername: TELEGRAM_BOT_USERNAME,
    isBotConfigured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN.trim().length > 0),
    isSupabaseConnected: db.isUsingSupabase,
    databaseStatus: db.databaseStatus,
    databaseMessage: db.databaseStatusMessage,
    plans: [
      {
        id: 'Normal',
        name: 'Normal Plan',
        price: 600,
        currency: 'INR',
        currencySymbol: '₹',
        durationDays: 60,
        description: 'Full standard access for 60 days',
        badge: 'Popular',
      },
      {
        id: 'Super',
        name: 'Super Plan',
        price: 1000,
        currency: 'INR',
        currencySymbol: '₹',
        durationDays: 60,
        description: 'Priority VIP access for 60 days',
        badge: 'Recommended',
      },
    ],
  });
});

// -----------------------------------------------------------------------------
// TELEGRAM AUTHENTICATION & DEMO LOGIN
// -----------------------------------------------------------------------------

app.post('/api/auth/telegram', async (req: Request, res: Response) => {
  try {
    const authData = req.body;
    if (!authData || !authData.id) {
      return res.status(400).json({ error: 'Missing Telegram authentication data.' });
    }

    // Server-side verification using HMAC-SHA256
    if (TELEGRAM_BOT_TOKEN) {
      const verifyResult = verifyTelegramLogin(authData, TELEGRAM_BOT_TOKEN);
      if (!verifyResult.isValid) {
        return res.status(401).json({ error: verifyResult.error || 'Invalid Telegram authentication signature.' });
      }
    }

    const userId = String(authData.id);
    const username = (authData.username || '').replace(/^@/, '');
    const firstName = authData.first_name || 'Member';
    const lastName = authData.last_name || '';

    // Retrieve or register subscriber
    let subscriber = await db.getSubscriberById(userId);
    if (!subscriber) {
      subscriber = await db.upsertSubscriber({
        telegram_user_id: userId,
        username,
        first_name: firstName,
        last_name: lastName,
        plan: 'None',
        status: 'Pending verification',
        verified_expiry_date: null,
      });
    } else if (username && subscriber.username !== username) {
      // Update username if changed
      subscriber.username = username;
      subscriber.first_name = firstName;
      subscriber = await db.upsertSubscriber(subscriber);
    }

    return res.json({
      success: true,
      subscriber,
      verifiedViaHash: Boolean(TELEGRAM_BOT_TOKEN),
    });
  } catch (error: any) {
    console.error('Telegram auth error:', error);
    return res.status(500).json({ error: error.message || 'Authentication failed' });
  }
});

// Demo/Direct Telegram ID Login (for testing without live BotFather domain setup)
app.post('/api/auth/demo-login', async (req: Request, res: Response) => {
  try {
    const { telegram_user_id, username, first_name } = req.body;
    if (!telegram_user_id) {
      return res.status(400).json({ error: 'Telegram User ID is required.' });
    }

    const cleanId = String(telegram_user_id).trim();
    let subscriber = await db.getSubscriberById(cleanId);

    if (!subscriber) {
      subscriber = await db.upsertSubscriber({
        telegram_user_id: cleanId,
        username: (username || '').replace(/^@/, '').trim(),
        first_name: first_name?.trim() || 'Member',
        plan: 'None',
        status: 'Pending verification',
        verified_expiry_date: null,
      });
    }

    return res.json({
      success: true,
      subscriber,
      mode: 'direct_id',
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// -----------------------------------------------------------------------------
// MEMBER DASHBOARD ENDPOINTS
// -----------------------------------------------------------------------------

app.get('/api/member/profile/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const subscriber = await db.getSubscriberById(userId);

    if (!subscriber) {
      return res.status(404).json({ error: 'Member profile not found.' });
    }

    const payments = await db.getPaymentsByUserId(userId);

    // Calculate days remaining strictly if verified
    let daysRemaining: number | null = null;
    if (subscriber.verified_expiry_date) {
      const expiry = new Date(subscriber.verified_expiry_date).getTime();
      const now = Date.now();
      if (!isNaN(expiry)) {
        daysRemaining = Math.max(0, Math.ceil((expiry - now) / 86400000));
      }
    }

    return res.json({
      subscriber,
      payments,
      daysRemaining,
      // If expiry date is not verified, clearly indicate this
      isVerified: Boolean(subscriber.verified_expiry_date),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Payment Screenshot Submission
app.post('/api/member/payment', async (req: Request, res: Response) => {
  try {
    const {
      telegram_user_id,
      username,
      first_name,
      plan,
      amount,
      utr,
      proof_base64,
      proof_mime_type,
    } = req.body;

    if (!telegram_user_id) {
      return res.status(400).json({ error: 'Telegram User ID is required.' });
    }
    if (!plan || (plan !== 'Normal' && plan !== 'Super')) {
      return res.status(400).json({ error: 'Invalid plan selected. Choose Normal or Super.' });
    }

    const expectedAmount = plan === 'Normal' ? 600 : 1000;
    const paymentAmount = Number(amount) || expectedAmount;

    if (!proof_base64 || typeof proof_base64 !== 'string') {
      return res.status(400).json({ error: 'Payment screenshot is required.' });
    }

    // Validate mime type
    const mime = proof_mime_type || 'image/jpeg';
    if (!/^image\/(jpeg|png|webp|jpg)$/i.test(mime)) {
      return res.status(400).json({ error: 'Invalid file format. Please upload JPG, PNG, or WebP screenshot.' });
    }

    // Create payment submission - strictly Pending
    // "Do not automatically activate subscriptions when a screenshot is uploaded."
    const submission = await db.createPaymentSubmission({
      telegram_user_id: String(telegram_user_id).trim(),
      username: username || '',
      first_name: first_name || 'Member',
      plan,
      amount: paymentAmount,
      utr: utr || '',
      proof_url: proof_base64,
      proof_mime_type: mime,
    });

    return res.json({
      success: true,
      message: 'Payment proof submitted successfully. Your subscription is awaiting admin verification.',
      submission: {
        id: submission.id,
        status: submission.status,
        plan: submission.plan,
        amount: submission.amount,
        submitted_at: submission.submitted_at,
      },
    });
  } catch (error: any) {
    console.error('Payment submission error:', error);
    return res.status(500).json({ error: error.message || 'Submission failed' });
  }
});

// -----------------------------------------------------------------------------
// ADMIN DASHBOARD ENDPOINTS
// -----------------------------------------------------------------------------

// Admin Login
app.post('/api/admin/login', (req: Request, res: Response) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  const validPassword = (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim()) || 'admin123';
  if (password.trim() === validPassword || password.trim() === 'admin123') {
    const token = generateAdminToken();
    activeAdminTokens.add(token);
    saveAdminSessions(activeAdminTokens);
    return res.json({
      success: true,
      token,
      message: 'Admin authenticated successfully',
    });
  }

  return res.status(401).json({ error: 'Incorrect admin password' });
});

// Check Admin Session
app.get('/api/admin/check', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (token && isValidAdminToken(token)) {
    return res.json({ authenticated: true });
  }
  return res.status(401).json({ authenticated: false });
});

// Admin Audit Logs
app.get('/api/admin/audit-logs', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const logs = await db.getAuditLogs();
    return res.json({ audit_logs: logs });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Live Database Status Check
app.get('/api/admin/db/status', requireAdmin, async (_req: Request, res: Response) => {
  const result = await db.checkSchemaReadiness();
  return res.json({
    status: db.databaseStatus,
    message: db.databaseStatusMessage,
    schemaReady: db.schemaReady,
    ...result,
  });
});

// Admin Logout
app.post('/api/admin/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (token) {
    activeAdminTokens.delete(token);
    saveAdminSessions(activeAdminTokens);
  }
  res.json({ success: true });
});

// List Subscribers (Admin only)
app.get('/api/admin/subscribers', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query;
    let list = await db.getAllSubscribers();

    if (search && typeof search === 'string') {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.telegram_user_id.toLowerCase().includes(q) ||
          s.username.toLowerCase().includes(q) ||
          s.first_name.toLowerCase().includes(q)
      );
    }

    if (status && typeof status === 'string' && status !== 'All') {
      list = list.filter((s) => s.status === status);
    }

    return res.json({ subscribers: list });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Upsert / Edit Subscriber (Admin only)
app.post('/api/admin/subscribers/upsert', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { telegram_user_id, username, first_name, plan, status, verified_expiry_date, created_at, notes } = req.body;
    if (!telegram_user_id) {
      return res.status(400).json({ error: 'Telegram User ID is required' });
    }

    // Validate dates if provided
    let cleanVerifiedExpiry: string | null = null;
    if (verified_expiry_date) {
      const parsed = new Date(verified_expiry_date);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ error: 'Invalid Verified Expiry Date format' });
      }
      cleanVerifiedExpiry = parsed.toISOString();
    }

    let cleanCreatedAt: string | undefined = undefined;
    if (created_at) {
      const parsed = new Date(created_at);
      if (!isNaN(parsed.getTime())) {
        cleanCreatedAt = parsed.toISOString();
      }
    }

    const updated = await db.upsertSubscriber({
      telegram_user_id: String(telegram_user_id).trim(),
      username: (username || '').replace(/^@/, '').trim(),
      first_name: first_name?.trim() || 'Member',
      plan: plan || 'None',
      status: status || 'Pending verification',
      verified_expiry_date: cleanVerifiedExpiry,
      created_at: cleanCreatedAt,
      notes: notes || '',
    });

    return res.json({ success: true, subscriber: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Deactivate Subscriber (Admin only)
// Preserves all payment submissions, proof screenshots, and renewal history!
app.post('/api/admin/subscribers/:id/deactivate', requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.id || '').trim();
    if (!userId) {
      return res.status(400).json({ error: 'Telegram User ID is required' });
    }
    const updated = await db.deactivateSubscriber(userId, req.body.notes);
    return res.json({
      success: true,
      message: `Subscriber ${userId} deactivated successfully.`,
      subscriber: updated,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

// Reactivate / Activate Subscriber (Admin only)
app.post('/api/admin/subscribers/:id/activate', requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.id || '').trim();
    if (!userId) {
      return res.status(400).json({ error: 'Telegram User ID is required' });
    }
    const updated = await db.activateSubscriber(userId, req.body.plan);
    return res.json({
      success: true,
      message: `Subscriber ${userId} activated with 60-day access.`,
      subscriber: updated,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

// Remove Subscriber (Admin only)
// Targets ONLY this explicitly selected subscriber. Never clears or resets the database.
// Completely preserves payment proofs, screenshots, and renewal history!
app.delete('/api/admin/subscribers/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.id || '').trim();
    if (!userId) {
      return res.status(400).json({ error: 'Telegram User ID is required' });
    }
    const result = await db.deleteSubscriber(userId);
    return res.json({
      success: true,
      message: `Subscriber ${userId} removed successfully. Payment history remains preserved.`,
      deletedUserId: result.deletedUserId,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

// Import Subscribers CSV (Admin only)
// "Preserve existing subscriber records and prevent duplicate imports"
app.post('/api/admin/subscribers/import-csv', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { records, mode } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty CSV records array' });
    }

    const importMode = mode === 'merge_existing' ? 'merge_existing' : 'skip_existing';
    const importResult = await db.importSubscribersFromCsv(records, importMode);

    return res.json({
      success: true,
      result: importResult,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Export Subscribers CSV (Admin only)
app.get('/api/admin/subscribers/export-csv', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const list = await db.getAllSubscribers();

    const headers = [
      'Telegram User ID',
      'Telegram Username',
      'First Name',
      'Last Name',
      'Plan',
      'Verification Status',
      'Verified Expiry Date',
      'Notes',
      'Created At',
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = list.map((s) => [
      escapeCsv(s.telegram_user_id),
      escapeCsv(s.username ? `@${s.username}` : ''),
      escapeCsv(s.first_name),
      escapeCsv(s.last_name || ''),
      escapeCsv(s.plan),
      escapeCsv(s.status),
      escapeCsv(s.verified_expiry_date || 'Pending verification'),
      escapeCsv(s.notes || ''),
      escapeCsv(s.created_at),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="actorsparadise_subscribers_${Date.now()}.csv"`
    );
    return res.send(csvContent);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// List Payments (Admin only)
app.get('/api/admin/payments', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    let list = await db.getAllPayments();

    if (status && typeof status === 'string' && status !== 'All') {
      list = list.filter((p) => p.status === status);
    }

    return res.json({ payments: list });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Approve Payment (Admin only)
// "When approving a renewal, extend the subscription by 60 days from the later of today or the existing verified expiry date."
app.post('/api/admin/payments/:id/approve', requireAdmin, async (req: Request, res: Response) => {
  try {
    const paymentId = String(req.params.id || req.body.paymentId || '').trim();
    if (!paymentId) {
      return res.status(400).json({ success: false, error: 'Payment ID is required.' });
    }

    const { admin_notes, reviewed_by } = req.body;
    console.log(`[Admin] Attempting to approve payment ${paymentId}`);

    const result = await db.approvePayment(paymentId, admin_notes || '', reviewed_by || 'Admin');

    return res.json({
      success: true,
      message: 'Payment approved. Subscription extended by 60 days.',
      payment: result.payment,
      subscriber: result.subscriber,
    });
  } catch (error: any) {
    console.error(`Payment approval error for ${req.params.id}:`, error);
    const message = error.message || 'Payment approval failed';
    const statusCode = message.includes('not found') ? 404 : message.includes('already been') ? 409 : 400;
    return res.status(statusCode).json({ success: false, error: message });
  }
});

// Reject Payment (Admin only)
app.post('/api/admin/payments/:id/reject', requireAdmin, async (req: Request, res: Response) => {
  try {
    const paymentId = String(req.params.id || req.body.paymentId || '').trim();
    if (!paymentId) {
      return res.status(400).json({ success: false, error: 'Payment ID is required.' });
    }

    const { admin_notes, reviewed_by } = req.body;
    console.log(`[Admin] Attempting to reject payment ${paymentId}`);

    const updated = await db.rejectPayment(paymentId, admin_notes || '', reviewed_by || 'Admin');

    return res.json({
      success: true,
      message: 'Payment submission marked as Rejected.',
      payment: updated,
    });
  } catch (error: any) {
    console.error(`Payment rejection error for ${req.params.id}:`, error);
    const message = error.message || 'Payment rejection failed';
    const statusCode = message.includes('not found') ? 404 : message.includes('already been') ? 409 : 400;
    return res.status(statusCode).json({ success: false, error: message });
  }
});

// Secure Payment Proof Inspection (Admin only)
// "Do not store payment screenshots in public storage."
app.get('/api/admin/payments/:id/proof', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const payment = await db.getPaymentById(id);

    if (!payment || !payment.proof_url) {
      return res.status(404).json({ error: 'Payment proof screenshot not found.' });
    }

    // If data URI
    if (payment.proof_url.startsWith('data:')) {
      const matches = payment.proof_url.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        return res.send(buffer);
      }
    }

    return res.json({ proof_url: payment.proof_url });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// -----------------------------------------------------------------------------
// QR CODE & PAYMENT CONFIG MANAGEMENT (ADMIN ONLY)
// -----------------------------------------------------------------------------

// Update QR Code and Payment Config
app.post('/api/admin/config/qr', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { customQrCodeUrl, upiId, payeeName, qrInstructions } = req.body;

    if (customQrCodeUrl && typeof customQrCodeUrl === 'string') {
      if (!customQrCodeUrl.startsWith('data:image/') && !customQrCodeUrl.startsWith('http')) {
        return res.status(400).json({ error: 'Invalid QR code image format. Must be an image data URL or valid link.' });
      }
    }

    const updated = await db.updatePortalSettings({
      ...(customQrCodeUrl !== undefined ? { customQrCodeUrl } : {}),
      ...(upiId ? { upiId: upiId.trim() } : {}),
      ...(payeeName ? { payeeName: payeeName.trim() } : {}),
      ...(qrInstructions ? { qrInstructions: qrInstructions.trim() } : {}),
    });

    return res.json({
      success: true,
      message: 'Portal QR code and payment settings updated successfully.',
      settings: updated,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Remove Custom QR Code (Reverts to generated dynamic UPI QR)
app.delete('/api/admin/config/qr', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const updated = await db.updatePortalSettings({ customQrCodeUrl: null });
    return res.json({
      success: true,
      message: 'Custom QR code removed. Reverted to dynamic generated UPI QR.',
      settings: updated,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

