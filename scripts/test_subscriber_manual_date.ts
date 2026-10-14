import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

async function testManualSubscriberDateLifecycle() {
  console.log('=== VERIFYING MANUAL SUBSCRIBER DATE SELECTION & PERSISTENCE LIFECYCLE ===\n');

  // 1. Admin login
  const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin123' }),
  });
  const loginData = (await loginRes.json()) as any;
  if (!loginRes.ok || !loginData.token) {
    throw new Error('Admin login failed: ' + JSON.stringify(loginData));
  }
  const token = loginData.token;
  console.log('1. Admin login successful');

  // 2. Snapshot original subscribers and payments
  const originalSubsRes = await fetch(`${BASE_URL}/api/admin/subscribers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const originalSubsData = (await originalSubsRes.json()) as any;
  const originalCount = originalSubsData.subscribers?.length || 0;
  const originalIds = new Set(originalSubsData.subscribers.map((s: any) => s.telegram_user_id));
  console.log(`2. Snapshot: ${originalCount} existing subscribers recorded`);

  const originalPaymentsRes = await fetch(`${BASE_URL}/api/admin/payments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const originalPaymentsData = (await originalPaymentsRes.json()) as any;
  const originalPaymentCount = originalPaymentsData.payments?.length || 0;
  console.log(`   Snapshot: ${originalPaymentCount} existing payments recorded`);

  // 3. Add a dummy subscriber with distinct Day, Month, Year
  const dummyId = `dummy_manual_${Date.now()}`;
  const initialStartDate = '2024-02-14T00:00:00.000Z';
  const initialExpiryDate = '2027-09-25T00:00:00.000Z';

  console.log('\n3. Adding dummy subscriber with manual dates:');
  console.log(`   - Start Date: 2024-02-14 (Feb 14, 2024)`);
  console.log(`   - Expiry Date: 2027-09-25 (Sep 25, 2027)`);

  const addRes = await fetch(`${BASE_URL}/api/admin/subscribers/upsert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      telegram_user_id: dummyId,
      username: 'datetester_pro',
      first_name: 'Date Tester',
      plan: 'Super',
      status: 'Active',
      created_at: initialStartDate,
      verified_expiry_date: initialExpiryDate,
      notes: 'Initial test creation',
    }),
  });

  const addData = (await addRes.json()) as any;
  if (!addRes.ok || !addData.success) {
    throw new Error(`Failed to add subscriber: ${JSON.stringify(addData)}`);
  }
  console.log('✓ Successfully added dummy subscriber with custom dates!');

  // 4. Verify subscriber was stored with exact dates
  const fetchAfterAdd = await fetch(`${BASE_URL}/api/admin/subscribers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const subsAfterAdd = ((await fetchAfterAdd.json()) as any).subscribers;
  const createdSub = subsAfterAdd.find((s: any) => s.telegram_user_id === dummyId);
  if (!createdSub) throw new Error('Dummy subscriber not found in list after creation');

  console.log(`\n4. Verifying created record:`);
  console.log(`   - Stored created_at: ${createdSub.created_at}`);
  console.log(`   - Stored verified_expiry_date: ${createdSub.verified_expiry_date}`);
  console.log(`   - Status: ${createdSub.status}`);
  console.log(`   - Plan: ${createdSub.plan}`);

  if (!createdSub.created_at?.startsWith('2024-02-14')) {
    throw new Error(`Expected start date 2024-02-14, got: ${createdSub.created_at}`);
  }
  if (!createdSub.verified_expiry_date?.startsWith('2027-09-25')) {
    throw new Error(`Expected expiry date 2027-09-25, got: ${createdSub.verified_expiry_date}`);
  }

  // 5. Edit subscriber: modify Day, Month, Year independently
  const updatedStartDate = '2023-11-05T00:00:00.000Z'; // Nov 5, 2023
  const updatedExpiryDate = '2029-12-31T00:00:00.000Z'; // Dec 31, 2029
  console.log('\n5. Editing dummy subscriber dates independently:');
  console.log(`   - New Start Date: 2023-11-05 (Nov 05, 2023)`);
  console.log(`   - New Expiry Date: 2029-12-31 (Dec 31, 2029)`);

  const editRes = await fetch(`${BASE_URL}/api/admin/subscribers/upsert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      telegram_user_id: dummyId,
      username: 'datetester_pro',
      first_name: 'Date Tester',
      plan: 'Super',
      status: 'Active',
      created_at: updatedStartDate,
      verified_expiry_date: updatedExpiryDate,
      notes: 'Updated dates',
    }),
  });

  const editData = (await editRes.json()) as any;
  if (!editRes.ok || !editData.success) {
    throw new Error(`Failed to update subscriber: ${JSON.stringify(editData)}`);
  }
  console.log('✓ Successfully saved edited subscriber dates!');

  // 6. Simulate page refresh: re-fetch from database and verify persistence
  console.log('\n6. Simulating page refresh by re-fetching subscriber list from database...');
  const reloadRes = await fetch(`${BASE_URL}/api/admin/subscribers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const reloadedSubs = ((await reloadRes.json()) as any).subscribers;
  const reloadedSub = reloadedSubs.find((s: any) => s.telegram_user_id === dummyId);
  if (!reloadedSub) throw new Error('Dummy subscriber disappeared after reload');

  console.log(`   - Verified reloaded created_at: ${reloadedSub.created_at}`);
  console.log(`   - Verified reloaded verified_expiry_date: ${reloadedSub.verified_expiry_date}`);
  console.log(`   - Verified plan: ${reloadedSub.plan}`);
  console.log(`   - Verified status: ${reloadedSub.status}`);
  console.log(`   - Verified username: ${reloadedSub.username}`);

  if (!reloadedSub.created_at?.startsWith('2023-11-05')) {
    throw new Error(`Start date did not persist! Expected 2023-11-05, got: ${reloadedSub.created_at}`);
  }
  if (!reloadedSub.verified_expiry_date?.startsWith('2029-12-31')) {
    throw new Error(`Expiry date did not persist! Expected 2029-12-31, got: ${reloadedSub.verified_expiry_date}`);
  }
  if (reloadedSub.plan !== 'Super' || reloadedSub.username !== 'datetester_pro') {
    throw new Error('Changing dates inadvertently reset other subscriber fields!');
  }
  console.log('✓ Selected dates persisted perfectly across full refresh without resetting other fields!');

  // 7. Verify all original records remained untouched
  console.log('\n7. Verifying all original records remain completely untouched...');
  for (const origId of originalIds) {
    const checkOriginal = reloadedSubs.find((s: any) => s.telegram_user_id === origId);
    if (!checkOriginal) {
      throw new Error(`Original subscriber ${origId} was affected or deleted!`);
    }
  }
  console.log(`✓ All ${originalCount} original subscriber records are intact!`);

  const checkPaymentsRes = await fetch(`${BASE_URL}/api/admin/payments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const checkPaymentsData = (await checkPaymentsRes.json()) as any;
  if (checkPaymentsData.payments?.length !== originalPaymentCount) {
    throw new Error('Original payment records count changed unexpectedly');
  }
  console.log(`✓ All ${originalPaymentCount} original payment records are intact!`);

  // 8. Clean up dummy subscriber
  console.log('\n8. Cleaning up test dummy subscriber record...');
  const deleteRes = await fetch(`${BASE_URL}/api/admin/subscribers/${encodeURIComponent(dummyId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const deleteData = (await deleteRes.json()) as any;
  if (!deleteRes.ok || !deleteData.success) {
    throw new Error(`Failed to clean up dummy subscriber: ${JSON.stringify(deleteData)}`);
  }
  console.log('✓ Test dummy subscriber removed cleanly.');

  // Final count check
  const finalSubsRes = await fetch(`${BASE_URL}/api/admin/subscribers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const finalSubs = ((await finalSubsRes.json()) as any).subscribers;
  if (finalSubs.length !== originalCount) {
    throw new Error(`Final subscriber count mismatch: expected ${originalCount}, got ${finalSubs.length}`);
  }
  console.log(`✓ Final subscriber count strictly restored to original ${originalCount} records.\n`);

  console.log('========================================================================');
  console.log('ALL MANUAL SUBSCRIBER DATE VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
  console.log('========================================================================');
  process.exit(0);
}

testManualSubscriberDateLifecycle().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
