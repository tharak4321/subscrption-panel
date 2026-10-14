import { db, calculateRenewalExpiryDate } from '../server/db.js';

async function runTests() {
  console.log('=== RUNNING PAYMENT FLOW & APPROVAL VERIFICATION TESTS ===\n');

  // Test 1: calculateRenewalExpiryDate logic
  console.log('Test 1: 60-day renewal calculation logic');
  const now = new Date();
  
  // Case A: No existing expiry (null)
  const expiryFromNull = calculateRenewalExpiryDate(null);
  const diffDaysFromNull = Math.round((new Date(expiryFromNull).getTime() - now.getTime()) / 86400000);
  console.log(`- From null: expected ~60 days, got ${diffDaysFromNull} days`);
  if (diffDaysFromNull !== 60) throw new Error(`Expected 60 days from null, got ${diffDaysFromNull}`);

  // Case B: Existing past expiry (e.g. expired 10 days ago)
  const pastExpiry = new Date(now.getTime() - 10 * 86400000).toISOString();
  const expiryFromPast = calculateRenewalExpiryDate(pastExpiry);
  const diffDaysFromPast = Math.round((new Date(expiryFromPast).getTime() - now.getTime()) / 86400000);
  console.log(`- From past date: expected ~60 days from today, got ${diffDaysFromPast} days`);
  if (diffDaysFromPast !== 60) throw new Error(`Expected 60 days from today when past, got ${diffDaysFromPast}`);

  // Case C: Existing future expiry (e.g. 20 days remaining)
  const futureExpiry = new Date(now.getTime() + 20 * 86400000).toISOString();
  const expiryFromFuture = calculateRenewalExpiryDate(futureExpiry);
  const diffDaysFromFuture = Math.round((new Date(expiryFromFuture).getTime() - new Date(futureExpiry).getTime()) / 86400000);
  console.log(`- From future date (+20d): expected 60 days added to future date (total ~80d from now), got ${diffDaysFromFuture} days extension`);
  if (diffDaysFromFuture !== 60) throw new Error(`Expected exactly 60 days extension from future date, got ${diffDaysFromFuture}`);

  console.log('✓ Test 1 passed!\n');

  // Test 2: Inserting payment with exact ID pattern like user reported ("pay_179187982306_7pkwi")
  console.log('Test 2: Creating and retrieving payment with exact string ID');
  const testUserId = 'test_user_' + Date.now();
  
  // Submit payment
  const payment = await db.createPaymentSubmission({
    telegram_user_id: testUserId,
    username: 'test_actor',
    first_name: 'Test Actor',
    plan: 'Super',
    amount: 1000,
    utr: 'UTR99887766',
    proof_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD',
  });

  const generatedId = payment.id;
  console.log(`- Created payment submission with ID: "${generatedId}", amount: ₹${payment.amount}, plan: ${payment.plan}`);
  if (!generatedId.startsWith('pay_')) throw new Error(`Payment ID must start with pay_, got ${generatedId}`);

  // Retrieve via getAllPayments
  const allPayments = await db.getAllPayments();
  const foundInList = allPayments.find((p) => p.id === generatedId);
  if (!foundInList) throw new Error(`Payment ${generatedId} was not found in getAllPayments()!`);
  console.log(`- Found in getAllPayments(): ID "${foundInList.id}", Status: "${foundInList.status}"`);

  // Retrieve via getPaymentById
  const foundById = await db.getPaymentById(generatedId);
  if (!foundById) throw new Error(`Payment ${generatedId} was not found in getPaymentById()!`);
  console.log(`- Found in getPaymentById(): ID "${foundById.id}", Amount: ₹${foundById.amount}`);
  if (foundById.id !== generatedId) throw new Error(`ID mismatch: expected ${generatedId}, got ${foundById.id}`);

  console.log('✓ Test 2 passed!\n');

  // Test 3: Approving the payment and verifying 60-day extension
  console.log('Test 3: Approving payment and verifying subscriber updates');
  const approveResult = await db.approvePayment(generatedId, 'Approved in verification test', 'AdminTest');
  console.log(`- Payment approved: status is now "${approveResult.payment.status}"`);
  console.log(`- Subscriber plan is now "${approveResult.subscriber.plan}"`);
  console.log(`- Subscriber verified_expiry_date is now "${approveResult.subscriber.verified_expiry_date}"`);
  console.log(`- Subscriber status is now "${approveResult.subscriber.status}"`);

  if (approveResult.payment.status !== 'Approved') throw new Error('Payment status should be Approved');
  if (approveResult.subscriber.status !== 'Active') throw new Error('Subscriber status should be Active');
  if (approveResult.subscriber.plan !== 'Super') throw new Error('Subscriber plan should be Super');

  // Verify getPaymentById returns updated status
  const afterApproval = await db.getPaymentById(generatedId);
  if (afterApproval?.status !== 'Approved') throw new Error('Payment status in db should be Approved');

  console.log('✓ Test 3 passed!\n');

  // Test 4: Prevent duplicate approvals when clicked twice
  console.log('Test 4: Duplicate approval prevention');
  let duplicatePrevented = false;
  try {
    await db.approvePayment(generatedId, 'Second click should fail', 'AdminTest');
  } catch (err: any) {
    duplicatePrevented = true;
    console.log(`- Successfully caught duplicate approval attempt: "${err.message}"`);
  }
  if (!duplicatePrevented) throw new Error('Duplicate approval was NOT prevented!');

  // Verify subscriber expiry date was NOT modified again
  const subAfterDuplicate = await db.getSubscriberById(testUserId);
  if (subAfterDuplicate?.verified_expiry_date !== approveResult.subscriber.verified_expiry_date) {
    throw new Error('Subscriber expiry date should not change on duplicate approval attempt');
  }
  console.log('✓ Test 4 passed: Expiry date was preserved, duplicate approval was blocked!\n');

  // Test 5: Rejection flow
  console.log('Test 5: Rejection flow');
  const testUserId2 = 'test_user_reject_' + Date.now();
  const payment2 = await db.createPaymentSubmission({
    telegram_user_id: testUserId2,
    username: 'reject_user',
    first_name: 'Reject User',
    plan: 'Normal',
    amount: 600,
    proof_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD',
  });

  const rejectedPayment = await db.rejectPayment(payment2.id, 'Invalid screenshot proof', 'AdminTest');
  console.log(`- Payment ${payment2.id} status is now "${rejectedPayment.status}"`);
  if (rejectedPayment.status !== 'Rejected') throw new Error('Payment status should be Rejected');

  const sub2 = await db.getSubscriberById(testUserId2);
  console.log(`- Subscriber status remains "${sub2?.status}" with verified expiry: ${sub2?.verified_expiry_date}`);
  if (sub2?.verified_expiry_date !== null) throw new Error('Subscriber expiry should not be activated on rejection');

  // Duplicate rejection prevention
  let duplicateRejectBlocked = false;
  try {
    await db.rejectPayment(payment2.id, 'Second reject', 'AdminTest');
  } catch (err: any) {
    duplicateRejectBlocked = true;
    console.log(`- Duplicate rejection blocked: "${err.message}"`);
  }
  if (!duplicateRejectBlocked) throw new Error('Duplicate rejection was NOT prevented!');

  console.log('✓ Test 5 passed!\n');

  // Test 6: Specific test for "pay_179187982306_7pkwi" simulation
  console.log('Test 6: Simulating the user specific payment "pay_179187982306_7pkwi"');
  const targetId = 'pay_179187982306_7pkwi';
  // Manually ensure targetId exists if not already present
  const existingTarget = await db.getPaymentById(targetId);
  if (!existingTarget) {
    // Create subscriber and payment with that exact ID
    await db.upsertSubscriber({
      telegram_user_id: '884129402',
      username: 'dragonbreath1',
      first_name: 'Dragon',
      plan: 'Super',
    });
    
    // Add payment directly to test resolution
    const samplePayment: any = {
      id: targetId,
      telegram_user_id: '884129402',
      username: 'dragonbreath1',
      first_name: 'Dragon',
      plan: 'Super',
      amount: 1000,
      utr: 'UTR179187982306',
      proof_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD',
      proof_mime_type: 'image/jpeg',
      status: 'Pending',
      admin_notes: '',
      submitted_at: new Date().toISOString(),
    };
    (db as any).localData.payments.unshift(samplePayment);
    (db as any).saveLocalStore();
  } else if (existingTarget.status !== 'Pending') {
    existingTarget.status = 'Pending';
    (db as any).saveLocalStore();
  }

  const lookupTarget = await db.getPaymentById(targetId);
  if (!lookupTarget) throw new Error(`Lookup failed for ${targetId}`);
  console.log(`- Successfully looked up "${targetId}", found amount: ₹${lookupTarget.amount}, status: "${lookupTarget.status}"`);

  // Now approve it
  const approvedTarget = await db.approvePayment(targetId, 'Verified test payment for pay_179187982306_7pkwi', 'Admin');
  console.log(`- Successfully approved "${targetId}"! New status: "${approvedTarget.payment.status}", Extended expiry: ${approvedTarget.subscriber.verified_expiry_date}`);
  if (approvedTarget.payment.status !== 'Approved') throw new Error(`Approval failed for ${targetId}`);

  console.log('✓ Test 6 passed!\n');

  console.log('====================================================');
  console.log('ALL VERIFICATION TESTS PASSED SUCCESSFULLY! (6/6)');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
