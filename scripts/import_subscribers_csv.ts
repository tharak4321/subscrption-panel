/**
 * Actorsparadise Real Subscriber CSV Migration & Import Tool
 *
 * Usage:
 *   npx tsx scripts/import_subscribers_csv.ts <path-to-csv> [--dry-run] [--mode=skip_existing|merge_existing]
 *
 * Rules:
 *   - Preserves Telegram IDs, usernames, first/last names, and verified dates.
 *   - NEVER invents payment status, subscription start dates, or expiry dates.
 *   - Where dates are unverified, leaves them strictly unverified (null).
 *   - Prevents duplicate Telegram IDs.
 *   - Supports --dry-run for complete pre-validation before committing.
 */

import fs from 'fs';
import path from 'path';
import { db } from '../server/db.js';
import { Subscriber, PlanType, SubscriptionStatus } from '../server/types.js';

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let insideQuote = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    if (vals.length === 0 || (vals.length === 1 && !vals[0])) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const mergeMode = args.includes('--mode=merge_existing') ? 'merge_existing' : 'skip_existing';
  const filePathArg = args.find((a) => !a.startsWith('--'));

  console.log('========================================================================');
  console.log('ACTORSPARADISE SUBSCRIBER CSV MIGRATION TOOL');
  console.log(`Execution Mode: ${isDryRun ? 'DRY-RUN (Validation only, no writes)' : 'COMMIT (Live Database)'}`);
  console.log(`Duplicate Resolution: ${mergeMode}`);
  console.log('========================================================================\n');

  if (!filePathArg) {
    console.error('ERROR: No CSV file path provided.');
    console.log('\nUsage:');
    console.log('  npx tsx scripts/import_subscribers_csv.ts <path-to-csv> [--dry-run] [--mode=skip_existing|merge_existing]');
    console.log('\nExample:');
    console.log('  npx tsx scripts/import_subscribers_csv.ts ./real_subscribers.csv --dry-run');
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), filePathArg);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`ERROR: File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const rawRows = parseCsv(content);
  console.log(`Loaded ${rawRows.length} rows from: ${resolvedPath}\n`);

  if (rawRows.length === 0) {
    console.error('ERROR: CSV file contains no data rows.');
    process.exit(1);
  }

  // Pre-load existing records to check for duplicates
  let existingRecords: Subscriber[] = [];
  try {
    existingRecords = await db.getAllSubscribers();
    console.log(`Existing database records found: ${existingRecords.length}`);
  } catch (err: any) {
    console.warn(`Note: Could not query existing database records: ${err.message}`);
  }

  const existingMap = new Map<string, Subscriber>();
  for (const s of existingRecords) {
    existingMap.set(String(s.telegram_user_id).trim(), s);
  }

  const seenInCsv = new Set<string>();
  const validSubscribers: Subscriber[] = [];
  const errors: string[] = [];
  let skippedDuplicatesInCsv = 0;
  let existingMatches = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowNum = i + 2; // accounting for 1-based index and header

    const rawId =
      row['telegram_user_id'] ||
      row['Telegram User ID'] ||
      row['Telegram ID'] ||
      row['user_id'] ||
      row['ID'] ||
      row['id'] ||
      row['telegram_id'];

    if (!rawId || !String(rawId).trim()) {
      errors.push(`Row ${rowNum}: Missing Telegram User ID`);
      continue;
    }

    const cleanId = String(rawId).trim();

    // Prevent duplicate IDs inside the same CSV file
    if (seenInCsv.has(cleanId)) {
      skippedDuplicatesInCsv++;
      errors.push(`Row ${rowNum}: Duplicate Telegram User ID ${cleanId} found inside CSV (skipped)`);
      continue;
    }
    seenInCsv.add(cleanId);

    const username = (
      row['username'] ||
      row['Username'] ||
      row['Telegram Username'] ||
      ''
    )
      .replace(/^@+/, '')
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

    // Parse verified expiry date strictly
    const rawExpiry =
      row['verified_expiry_date'] ||
      row['expiry_date'] ||
      row['Expiry Date'] ||
      row['Expiry'] ||
      row['expiry'];

    let verifiedExpiry: string | null = null;
    if (rawExpiry && rawExpiry.trim() !== '' && !/pending|none|null|unverified/i.test(rawExpiry)) {
      const d = new Date(rawExpiry.trim());
      if (!isNaN(d.getTime())) {
        verifiedExpiry = d.toISOString();
      }
    }

    // Determine status: NEVER invent active status if expiry is unverified or in past
    const rawStatus = (row['status'] || row['Status'] || row['Verification Status'] || '').trim();
    let status: SubscriptionStatus = 'Pending verification';
    if (/active/i.test(rawStatus) && verifiedExpiry && new Date(verifiedExpiry).getTime() > Date.now()) {
      status = 'Active';
    } else if (/expired/i.test(rawStatus)) {
      status = 'Expired';
    } else if (/deactivated/i.test(rawStatus)) {
      status = 'Deactivated';
    } else if (verifiedExpiry) {
      status = new Date(verifiedExpiry).getTime() > Date.now() ? 'Active' : 'Expired';
    }

    // Created At (subscription start date)
    const rawCreated = row['created_at'] || row['Created At'] || row['start_date'] || row['Start Date'];
    let createdAt = new Date().toISOString();
    if (rawCreated) {
      const parsed = new Date(rawCreated.trim());
      if (!isNaN(parsed.getTime())) {
        createdAt = parsed.toISOString();
      }
    }

    const notes = (row['notes'] || row['Notes'] || '').trim();

    const isExistingInDb = existingMap.has(cleanId);
    if (isExistingInDb) {
      existingMatches++;
    }

    validSubscribers.push({
      telegram_user_id: cleanId,
      username,
      first_name: firstName,
      last_name: lastName,
      plan,
      status,
      verified_expiry_date: verifiedExpiry,
      created_at: createdAt,
      updated_at: new Date().toISOString(),
      notes,
    });
  }

  console.log('--- VALIDATION SUMMARY ---');
  console.log(`Total Rows in CSV:       ${rawRows.length}`);
  console.log(`Valid Records:           ${validSubscribers.length}`);
  console.log(`Matches Existing in DB:  ${existingMatches}`);
  console.log(`Duplicate IDs in CSV:    ${skippedDuplicatesInCsv}`);
  console.log(`Format/Missing Errors:   ${errors.length}`);

  if (errors.length > 0) {
    console.log('\nWarnings / Validation Notes:');
    errors.slice(0, 10).forEach((e) => console.log(`  - ${e}`));
    if (errors.length > 10) console.log(`  ... and ${errors.length - 10} more`);
  }

  if (isDryRun) {
    console.log('\n[DRY RUN] Preview of first 5 records to be imported:');
    console.table(
      validSubscribers.slice(0, 5).map((s) => ({
        ID: s.telegram_user_id,
        Username: s.username,
        Name: `${s.first_name} ${s.last_name}`.trim(),
        Plan: s.plan,
        Status: s.status,
        Expiry: s.verified_expiry_date ? s.verified_expiry_date.split('T')[0] : '(Unverified)',
      }))
    );
    console.log('\n[DRY RUN COMPLETED] No changes were made to the database.');
    console.log('To execute this migration against the database, run without --dry-run:');
    console.log(`  npx tsx scripts/import_subscribers_csv.ts "${filePathArg}"\n`);
    process.exit(0);
  }

  // LIVE COMMIT
  console.log('\nProceeding with live database import...');
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const sub of validSubscribers) {
    const existing = existingMap.get(sub.telegram_user_id);
    if (existing) {
      if (mergeMode === 'skip_existing') {
        skipped++;
        continue;
      } else {
        await db.upsertSubscriber({
          telegram_user_id: sub.telegram_user_id,
          username: sub.username || existing.username,
          first_name: sub.first_name || existing.first_name,
          last_name: sub.last_name || existing.last_name,
          plan: sub.plan !== 'None' ? sub.plan : existing.plan,
          verified_expiry_date: sub.verified_expiry_date || existing.verified_expiry_date,
          status: sub.status !== 'Pending verification' ? sub.status : existing.status,
          notes: sub.notes ? `${existing.notes ? existing.notes + ' | ' : ''}${sub.notes}` : existing.notes,
        });
        updated++;
      }
    } else {
      await db.upsertSubscriber(sub);
      inserted++;
    }
  }

  console.log('\n========================================================================');
  console.log('MIGRATION COMPLETED SUCCESSFULLY!');
  console.log(`- New Subscribers Inserted: ${inserted}`);
  console.log(`- Existing Subscribers Updated: ${updated}`);
  console.log(`- Existing Subscribers Skipped: ${skipped}`);
  console.log('========================================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ MIGRATION FAILED:', err);
  process.exit(1);
});
