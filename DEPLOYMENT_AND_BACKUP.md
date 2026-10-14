# Actorsparadise Subscription Portal - Deployment & Backup Guide

This guide details how to deploy the portal to Vercel with Supabase PostgreSQL and private storage, configure Telegram bot authentication, and perform regular backups.

---

## 1. Supabase Database & Storage Setup

1. **Create a Supabase Project:**
   - Sign up or log in at [supabase.com](https://supabase.com).
   - Click **New Project**, select an organization, name it `actorsparadise-portal`, and set a strong database password.

2. **Run Database Schema:**
   - In your Supabase project dashboard, open the **SQL Editor** from the left navigation.
   - Copy the contents of `supabase_schema.sql` from this repository.
   - Paste into the SQL editor and click **Run**.
   - This creates the `subscribers`, `payments`, and `audit_logs` tables with constraints, indexes, Row Level Security (RLS), and the private `payment-proofs` storage bucket.

3. **Retrieve API Credentials:**
   - Navigate to **Project Settings** -> **API**.
   - Note down:
     - `Project URL` (e.g., `https://xyzcompany.supabase.co`)
     - `anon` / `public` Key
     - `service_role` (Secret) Key (Keep this confidential; never expose in frontend)

---

## 2. Telegram Bot Configuration

1. Open Telegram and message [@BotFather](https://t.me/botfather).
2. Create your bot with `/newbot` or select your existing bot.
3. Save the **Bot Token** (e.g. `123456789:ABCdefGhIJKlmNoPQRstuVWxYz`).
4. Set the domain for Telegram Login Widget:
   - Send `/setdomain` to `@BotFather`.
   - Select your bot.
   - Enter your production domain (e.g., `actorsparadise.vercel.app` or your custom domain).
5. Note down your bot username (without the `@` symbol).

---

## 3. Vercel Deployment

1. **Push your code to GitHub / GitLab:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Actorsparadise Subscription Portal"
   git branch -M main
   git remote add origin https://github.com/<your-username>/actorsparadise-portal.git
   git push -u origin main
   ```

2. **Import into Vercel:**
   - Log in to [vercel.com](https://vercel.com).
   - Click **Add New...** -> **Project**.
   - Select your repository.

3. **Configure Environment Variables in Vercel:**
   Under **Settings** -> **Environment Variables**, add:

   | Variable | Value / Description |
   | :--- | :--- |
   | `TELEGRAM_BOT_TOKEN` | Your Telegram Bot Token from `@BotFather` |
   | `TELEGRAM_BOT_USERNAME` | Your Telegram Bot username (e.g., `actorsparadise_bot`) |
   | `ADMIN_PASSWORD` | Strong password for the admin dashboard |
   | `UPI_ID` | `tharak4321@slc` |
   | `UPI_PAYEE_NAME` | `Actorsparadise` |
   | `ADMIN_CONTACT_TELEGRAM` | `dragonbreath1` |
   | `SUPABASE_URL` | Your Supabase project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service_role secret key |
   | `SUPABASE_ANON_KEY` | Your Supabase anon public key |

4. **Deploy:**
   - Click **Deploy**. Vercel will build the frontend and deploy the serverless backend.

---

## 4. Backup & Disaster Recovery Instructions

### Method A: One-Click Admin CSV Export (Subscriber Master Backup)
1. Log in to the Admin Dashboard (`/admin`).
2. Click **Export Subscribers CSV**.
3. A complete CSV containing Telegram User IDs, usernames, plan, verified expiry date, verification status, and notes is downloaded immediately.
4. Keep this file in secure offline storage regularly.

### Method B: Supabase Automated & Manual Database Backups
1. Supabase provides automated daily backups for all projects.
2. For manual full SQL dumps, run the following using the Supabase CLI or standard `pg_dump`:
   ```bash
   pg_dump "postgres://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres" \
     --table=public.subscribers \
     --table=public.payments \
     -F c -b -v -f "actorsparadise_backup_$(date +%Y%m%d).dump"
   ```
3. To restore from backup:
   ```bash
   pg_restore -d "postgres://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres" \
     --clean --if-exists -v "actorsparadise_backup_20261012.dump"
   ```

### Method C: Payment Proof Screenshots Backup
- Screenshots are stored securely in the `payment-proofs` private bucket.
- You can export the storage bucket contents via the Supabase Dashboard -> **Storage** -> **payment-proofs**, or using the Supabase CLI:
  ```bash
  supabase storage download payment-proofs ./proofs_backup/
  ```
