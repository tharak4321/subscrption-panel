# Actorsparadise Subscription Portal - Safe Migration & Real CSV Import Guide

This guide describes the reviewed, safe procedure to initialize your authoritative Supabase PostgreSQL database and import your real subscriber CSV export without data loss, duplicate records, or invented dates.

---

## 1. Database Setup in Supabase

Your Supabase project is already connected via `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

### Step 1: Initialize Base Tables in Supabase SQL Editor
1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Open your project (`nraelbrvrcfahvcvprgw`).
3. In the left sidebar, click **SQL Editor** -> **New Query**.
4. Copy the entire contents of `supabase_schema.sql` from this repository (or click **View SQL Schema** directly in the Admin Dashboard).
5. Paste the SQL into the editor and click **Run**.
6. The query will create:
   - `public.subscribers` (Subscribers master table)
   - `public.payments` (Payment submissions & proofs)
   - `public.audit_logs` (Security & admin audit trail)
   - `public.portal_settings` (QR & payment destinations)
   - Indexes, constraints, and Row Level Security (RLS) policies
   - `payment-proofs` private storage bucket

> **Note on Safety:** `supabase_schema.sql` uses `CREATE TABLE IF NOT EXISTS` and `DROP POLICY IF EXISTS`. It will NEVER drop tables, reset schemas, or delete existing records.

### Step 2: Verify Connection in Admin Dashboard
1. Log in to your Admin Console (`/admin` or via the Admin button in the footer).
2. In the top notification banner, click **Verify Database Connection** or **Recheck**.
3. The banner will turn green: *"Authoritative Supabase PostgreSQL tables verified and active."*

---

## 2. Importing Your Real Subscriber CSV Export

### Safeguards Implemented
- **No Automatic Imports:** Dummy data from `.data/store.json` or `.data/backup_store_pre_audit.json` is strictly ignored and never imported into production.
- **No Duplicate IDs:** Any duplicate Telegram IDs are caught and skipped (or merged if explicitly chosen).
- **Zero Invented Data:**
  - Where a subscriber has no verified expiry date, it remains strictly `null` (Pending verification).
  - Unpaid members are never marked as paid or active.
  - Subscription start dates (`created_at`) and Telegram usernames are preserved exactly as provided.

### Option A: Via Admin Dashboard (Web UI)
1. Go to the Admin Dashboard -> **Subscribers Master** tab.
2. Click **Import CSV**.
3. Choose your subscriber CSV export file (or drag & drop).
4. Review the preview of rows detected.
5. Select duplicate handling:
   - **Skip Existing (Recommended):** Keeps existing database records intact and only inserts new subscribers.
   - **Merge Existing:** Updates empty fields without resetting verified statuses.
6. Click **Execute Safe Import**.

### Option B: Via Command Line (CLI with Dry-Run)
You can test and validate your CSV with zero risk using the included migration CLI script:

```bash
# 1. Test and validate without making any changes:
npx tsx scripts/import_subscribers_csv.ts path/to/your_real_subscribers.csv --dry-run

# 2. Once validated, commit the records to the live database:
npx tsx scripts/import_subscribers_csv.ts path/to/your_real_subscribers.csv
```

---

## 3. CSV Column Reference

The importer automatically recognizes standard headers from previous exports:

| Column Name | Accepted Header Variants | Description |
| :--- | :--- | :--- |
| **Telegram User ID** *(Required)* | `telegram_user_id`, `Telegram User ID`, `Telegram ID`, `user_id`, `id` | Unique Telegram numeric or string ID |
| **Username** | `username`, `Telegram Username`, `Username` | Telegram handle (leading `@` is automatically stripped) |
| **First Name** | `first_name`, `First Name`, `name`, `Name` | Subscriber display name |
| **Last Name** | `last_name`, `Last Name` | Optional last name |
| **Plan** | `plan`, `Plan` | `Normal`, `Super`, or `None` |
| **Expiry Date** | `verified_expiry_date`, `expiry_date`, `Expiry Date`, `expiry` | ISO format `YYYY-MM-DD`. Left blank if unverified. |
| **Start Date** | `created_at`, `start_date`, `Start Date` | Subscription start timestamp |
| **Status** | `status`, `Status`, `Verification Status` | `Active`, `Expired`, `Pending verification`, `Deactivated` |
| **Notes** | `notes`, `Notes` | Internal administrative remarks |

---

## 4. Regular Database Backups

- **One-Click Export:** Go to Admin Dashboard -> Click **Export CSV** anytime to download a full CSV snapshot of all subscribers.
- **Supabase Daily Backups:** Automated daily snapshots are available in your Supabase project dashboard under **Database** -> **Backups**.
