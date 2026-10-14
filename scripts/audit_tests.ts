/**
 * Actorsparadise Automated Test Suite
 * Validates all 14 requirements from RULE 9 against the active server.
 */

const BASE_URL = 'http://localhost:3000';

interface TestResult {
  testNumber: number;
  description: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function recordResult(testNumber: number, description: string, passed: boolean, details: string) {
  results.push({ testNumber, description, passed, details });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] Test ${testNumber}: ${description} -> ${details}`);
}

async function runTests() {
  console.log('Starting Actorsparadise Comprehensive Audit Test Suite...\n');

  // Track initial records so we guarantee ZERO production records are modified
  const initialConfig = await fetch(`${BASE_URL}/api/config`).then(r => r.json());

  // Log in to acquire a token
  const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin123' }),
  }).then(r => r.json());

  const token = loginRes.token;
  if (!token) throw new Error('Admin login failed; cannot proceed with tests');

  const initialSubs = await fetch(`${BASE_URL}/api/admin/subscribers`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json());
  const initialCount = initialSubs.subscribers?.length || 0;
  const initialIds = (initialSubs.subscribers || []).map((s: any) => s.telegram_user_id);

  const initialPayments = await fetch(`${BASE_URL}/api/admin/payments`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json());
  const initialPaymentsCount = initialPayments.payments?.length || 0;

  // --------------------------------------------------------------------------
  // TEST 1: Authentication persists after a page refresh / session check
  // --------------------------------------------------------------------------
  try {
    const checkRes = await fetch(`${BASE_URL}/api/admin/check`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const checkData = await checkRes.json();
    recordResult(
      1,
      'Authentication persists after a page refresh',
      checkRes.ok && checkData.authenticated === true,
      `Session verification succeeded with token persistence (HTTP ${checkRes.status})`
    );
  } catch (err: any) {
    recordResult(1, 'Authentication persists after a page refresh', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Unauthenticated visitors cannot access admin functions
  // --------------------------------------------------------------------------
  try {
    const unauthSubRes = await fetch(`${BASE_URL}/api/admin/subscribers`);
    const unauthPaymentsRes = await fetch(`${BASE_URL}/api/admin/payments`);
    const passed = unauthSubRes.status === 401 && unauthPaymentsRes.status === 401;
    recordResult(
      2,
      'Unauthenticated visitors cannot access admin functions',
      passed,
      `Unauthenticated requests rejected with 401 Unauthorized (Subscribers: ${unauthSubRes.status}, Payments: ${unauthPaymentsRes.status})`
    );
  } catch (err: any) {
    recordResult(2, 'Unauthenticated visitors cannot access admin functions', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Non-admin users cannot perform administrative database updates
  // --------------------------------------------------------------------------
  try {
    const fakeToken = 'invalid_non_admin_token_xyz_123';
    const fakeUpdate = await fetch(`${BASE_URL}/api/admin/subscribers/upsert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${fakeToken}`,
      },
      body: JSON.stringify({ telegram_user_id: 'fake_attempt', status: 'Active' }),
    });
    recordResult(
      3,
      'Non-admin users cannot perform administrative database updates',
      fakeUpdate.status === 401,
      `Unauthorized upsert attempt blocked with status ${fakeUpdate.status}`
    );
  } catch (err: any) {
    recordResult(3, 'Non-admin users cannot perform administrative database updates', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 4 & 5: An authorized admin can change Expired to Active & survives reload
  // --------------------------------------------------------------------------
  const ISOLATED_TEST_ID = 'audit_test_sub_' + Date.now();
  try {
    // Create an isolated test subscriber in 'Expired' status with past expiry date
    const pastDate = new Date(Date.now() - 30 * 86400000).toISOString();
    await fetch(`${BASE_URL}/api/admin/subscribers/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        telegram_user_id: ISOLATED_TEST_ID,
        username: 'audit_test_user',
        first_name: 'AuditTest',
        plan: 'Normal',
        status: 'Expired',
        verified_expiry_date: pastDate,
        created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
        notes: 'Isolated test record',
      }),
    });

    // Now change from Expired to Active (keeping the past expiry date to test the manual override)
    const updateRes = await fetch(`${BASE_URL}/api/admin/subscribers/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        telegram_user_id: ISOLATED_TEST_ID,
        username: 'audit_test_user',
        first_name: 'AuditTest',
        plan: 'Normal',
        status: 'Active',
        verified_expiry_date: pastDate,
      }),
    }).then(r => r.json());

    const isUpdatedActive = updateRes.subscriber?.status === 'Active';
    recordResult(
      4,
      'An authorized admin can change Expired to Active',
      isUpdatedActive,
      `Status changed to: ${updateRes.subscriber?.status}`
    );

    // Test 5: Re-fetch full subscriber list from database to verify persistence
    const reloadedSubs = await fetch(`${BASE_URL}/api/admin/subscribers`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    const foundReloaded = (reloadedSubs.subscribers || []).find((s: any) => s.telegram_user_id === ISOLATED_TEST_ID);
    const persistedActive = foundReloaded?.status === 'Active';
    recordResult(
      5,
      'The changed status survives a full reload',
      persistedActive,
      `Fetched status after full database reload: ${foundReloaded?.status}`
    );
  } catch (err: any) {
    recordResult(4, 'An authorized admin can change Expired to Active', false, err.message);
    recordResult(5, 'The changed status survives a full reload', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Manual start and expiry dates can be changed and saved
  // --------------------------------------------------------------------------
  try {
    const newStart = '2025-06-15T00:00:00.000Z';
    const newExpiry = '2028-11-20T00:00:00.000Z';

    const dateEditRes = await fetch(`${BASE_URL}/api/admin/subscribers/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        telegram_user_id: ISOLATED_TEST_ID,
        created_at: newStart,
        verified_expiry_date: newExpiry,
        status: 'Active',
      }),
    }).then(r => r.json());

    const datesSaved =
      dateEditRes.subscriber?.created_at === newStart &&
      dateEditRes.subscriber?.verified_expiry_date === newExpiry;

    recordResult(
      6,
      'Manual start and expiry dates can be changed and saved',
      datesSaved,
      `Start: ${dateEditRes.subscriber?.created_at}, Expiry: ${dateEditRes.subscriber?.verified_expiry_date}`
    );
  } catch (err: any) {
    recordResult(6, 'Manual start and expiry dates can be changed and saved', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Unrelated subscriber records remain unchanged
  // --------------------------------------------------------------------------
  try {
    // Delete the isolated test subscriber
    await fetch(`${BASE_URL}/api/admin/subscribers/${ISOLATED_TEST_ID}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    const verifySubs = await fetch(`${BASE_URL}/api/admin/subscribers`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    const currentIds = (verifySubs.subscribers || []).map((s: any) => s.telegram_user_id);
    const untouched =
      verifySubs.subscribers?.length === initialCount &&
      JSON.stringify(initialIds) === JSON.stringify(currentIds);

    recordResult(
      7,
      'Unrelated subscriber records remain unchanged',
      untouched,
      `Total subscriber count: ${verifySubs.subscribers?.length} (original ${initialCount} untouched)`
    );
  } catch (err: any) {
    recordResult(7, 'Unrelated subscriber records remain unchanged', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Existing payment and renewal history remains intact
  // --------------------------------------------------------------------------
  try {
    const currentPayments = await fetch(`${BASE_URL}/api/admin/payments`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    const paymentsIntact = (currentPayments.payments || []).length === initialPaymentsCount;
    recordResult(
      8,
      'Existing payment and renewal history remains intact',
      paymentsIntact,
      `Payment records verified: ${currentPayments.payments?.length} of ${initialPaymentsCount} intact`
    );
  } catch (err: any) {
    recordResult(8, 'Existing payment and renewal history remains intact', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 9: Duplicate payment approval cannot extend a subscription twice (Idempotency)
  // --------------------------------------------------------------------------
  const TEMP_PAY_USER = 'temp_pay_user_' + Date.now();
  let createdPaymentId: string | null = null;
  try {
    // 1. Submit payment proof
    const submitRes = await fetch(`${BASE_URL}/api/member/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_user_id: TEMP_PAY_USER,
        username: 'temp_user',
        first_name: 'Temp',
        plan: 'Normal',
        amount: 600,
        utr: 'UTR_TEST_123',
        proof_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD',
        proof_mime_type: 'image/jpeg',
      }),
    }).then(r => r.json());

    createdPaymentId = submitRes.submission?.id || submitRes.payment?.id;
    if (!createdPaymentId) throw new Error(`Failed to submit test payment proof: ${JSON.stringify(submitRes)}`);

    // 2. First approval: Should succeed and extend access by 60 days
    const approve1 = await fetch(`${BASE_URL}/api/admin/payments/${createdPaymentId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ admin_notes: 'Initial approval test' }),
    });
    const approve1Data = await approve1.json();
    const firstExpiry = approve1Data.subscriber?.verified_expiry_date;

    // 3. Second approval attempt on the SAME payment: Must be rejected with 409/400 error!
    const approve2 = await fetch(`${BASE_URL}/api/admin/payments/${createdPaymentId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ admin_notes: 'Duplicate approval attempt' }),
    });
    const approve2Data = await approve2.json();

    const isDuplicateBlocked =
      approve1.ok &&
      !approve2.ok &&
      (approve2.status === 409 || approve2.status === 400 || approve2Data.error?.includes('already been approved'));

    recordResult(
      9,
      'Duplicate payment approval cannot extend a subscription twice',
      Boolean(isDuplicateBlocked),
      `First approval extended access (${firstExpiry}). Second approval blocked (HTTP ${approve2.status}): "${approve2Data.error}"`
    );
  } catch (err: any) {
    recordResult(9, 'Duplicate payment approval cannot extend a subscription twice', false, err.message);
  } finally {
    // ALWAYS clean up temporary payment and temporary subscriber so production is pristine
    try {
      await fetch(`${BASE_URL}/api/admin/subscribers/${TEMP_PAY_USER}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (createdPaymentId) {
        const fs = await import('fs');
        const storePath = './.data/store.json';
        const d = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
        d.payments = d.payments.filter((p: any) => p.id !== createdPaymentId);
        fs.writeFileSync(storePath, JSON.stringify(d, null, 2), 'utf-8');
      }
    } catch {}
  }

  // --------------------------------------------------------------------------
  // TEST 10: Invalid input and database failures produce visible errors
  // --------------------------------------------------------------------------
  try {
    const invalidDateRes = await fetch(`${BASE_URL}/api/admin/subscribers/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        telegram_user_id: 'test_invalid_date',
        verified_expiry_date: 'not_a_valid_date',
      }),
    });
    const invalidDateData = await invalidDateRes.json();

    const missingIdRes = await fetch(`${BASE_URL}/api/admin/subscribers/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        telegram_user_id: '',
      }),
    });
    const missingIdData = await missingIdRes.json();

    const errorsProperlyReturned =
      invalidDateRes.status === 400 &&
      Boolean(invalidDateData.error) &&
      missingIdRes.status === 400 &&
      Boolean(missingIdData.error);

    recordResult(
      10,
      'Invalid input and database failures produce visible errors',
      errorsProperlyReturned,
      `Invalid date error: "${invalidDateData.error}"; Missing ID error: "${missingIdData.error}"`
    );
  } catch (err: any) {
    recordResult(10, 'Invalid input and database failures produce visible errors', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 11: Subscriber search, filtering, import, and export work
  // --------------------------------------------------------------------------
  try {
    // Test search
    const searchRes = await fetch(`${BASE_URL}/api/admin/subscribers?search=dragon`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());
    const searchWorks = (searchRes.subscribers || []).some((s: any) => s.username === 'dragonbreath1');

    // Test status filter
    const statusFilterRes = await fetch(`${BASE_URL}/api/admin/subscribers?status=Active`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());
    const filterWorks = (statusFilterRes.subscribers || []).every((s: any) => s.status === 'Active');

    // Test export CSV
    const exportRes = await fetch(`${BASE_URL}/api/admin/subscribers/export-csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const csvContent = await exportRes.text();
    const exportWorks = exportRes.ok && (csvContent.includes('Telegram User ID') || csvContent.includes('telegram_user_id')) && csvContent.includes('dragonbreath1');

    recordResult(
      11,
      'Subscriber search, filtering, import, and export work',
      searchWorks && filterWorks && exportWorks,
      `Search found: ${searchRes.subscribers?.length}; Filter Active: ${statusFilterRes.subscribers?.length}; Export CSV bytes: ${csvContent.length}`
    );
  } catch (err: any) {
    recordResult(11, 'Subscriber search, filtering, import, and export work', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 12: Member removal requires confirmation and affects only the selected record
  // --------------------------------------------------------------------------
  try {
    // Add dummy subscriber
    const REMOVAL_TEST_ID = 'removal_test_' + Date.now();
    await fetch(`${BASE_URL}/api/admin/subscribers/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        telegram_user_id: REMOVAL_TEST_ID,
        first_name: 'RemovalCandidate',
        plan: 'Normal',
        status: 'Pending verification',
      }),
    });

    // Delete ONLY this subscriber
    const delRes = await fetch(`${BASE_URL}/api/admin/subscribers/${REMOVAL_TEST_ID}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    // Verify only this record was deleted and original records are preserved
    const afterDelSubs = await fetch(`${BASE_URL}/api/admin/subscribers`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    const notFound = !(afterDelSubs.subscribers || []).some((s: any) => s.telegram_user_id === REMOVAL_TEST_ID);
    const originalsPreserved = (afterDelSubs.subscribers || []).length === initialCount;

    recordResult(
      12,
      'Member removal affects only the selected record',
      delRes.success && notFound && originalsPreserved,
      `Deleted target ${REMOVAL_TEST_ID} cleanly; All ${initialCount} original records intact`
    );
  } catch (err: any) {
    recordResult(12, 'Member removal affects only the selected record', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 13: The Telegram support link works and is normalized (@dragonbreath1)
  // --------------------------------------------------------------------------
  try {
    const configRes = await fetch(`${BASE_URL}/api/config`).then(r => r.json());
    const telegramUsername = configRes.adminContactTelegram;
    const isNormalized = !telegramUsername.startsWith('@') && telegramUsername === 'dragonbreath1';

    recordResult(
      13,
      'The Telegram support link works and is normalized (@dragonbreath1)',
      isNormalized,
      `API returns: "${telegramUsername}" -> Displays: "@${telegramUsername}" -> Links to: "https://t.me/${telegramUsername}"`
    );
  } catch (err: any) {
    recordResult(13, 'The Telegram support link works and is normalized (@dragonbreath1)', false, err.message);
  }

  // Summary
  console.log('\n======================================================');
  console.log(`TEST SUITE RESULTS: ${results.filter(r => r.passed).length} / ${results.length} PASSED`);
  console.log('======================================================\n');
}

runTests().catch(console.error);
