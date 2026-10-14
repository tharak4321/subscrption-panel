import { app } from '../server/app.js';
import { db } from '../server/db.js';
import http from 'http';

async function testHttpEndpoints() {
  console.log('=== TESTING HTTP REST ENDPOINTS FOR PAYMENT APPROVAL ===\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(3098, '127.0.0.1', () => resolve()));

  try {
    // 1. Admin login to get bearer token
    console.log('1. Admin login...');
    const loginRes = await fetch('http://127.0.0.1:3098/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin123' }),
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok || !loginData.token) throw new Error('Admin login failed');
    const token = loginData.token;
    console.log('✓ Admin authenticated, token received');

    // 2. Submit a pending payment via /api/member/payment
    console.log('\n2. Submitting pending payment...');
    const userId = 'http_user_' + Date.now();
    const submitRes = await fetch('http://127.0.0.1:3098/api/member/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_user_id: userId,
        username: 'http_actor',
        first_name: 'HTTP Actor',
        plan: 'Super',
        amount: 1000,
        utr: 'UTR_HTTP_123',
        proof_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD',
        proof_mime_type: 'image/jpeg',
      }),
    });
    const submitData = await submitRes.json();
    if (!submitRes.ok || !submitData.submission) throw new Error('Payment submission failed');
    const paymentId = submitData.submission.id;
    console.log(`✓ Submitted payment with ID: ${paymentId}, Status: ${submitData.submission.status}`);

    // 3. Fetch admin payments list via GET /api/admin/payments
    console.log('\n3. Fetching admin payments list...');
    const listRes = await fetch('http://127.0.0.1:3098/api/admin/payments?status=Pending', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listData = await listRes.json();
    if (!listRes.ok) throw new Error('Fetching payments failed');
    const found = listData.payments.find((p: any) => p.id === paymentId);
    if (!found) throw new Error(`Submitted payment ${paymentId} not found in /api/admin/payments!`);
    console.log(`✓ Payment ${paymentId} successfully listed in admin pending queue!`);

    // 4. Approve payment via POST /api/admin/payments/:id/approve
    console.log('\n4. Approving payment via HTTP API...');
    const approveRes = await fetch(`http://127.0.0.1:3098/api/admin/payments/${encodeURIComponent(paymentId)}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ admin_notes: 'HTTP Test Verification', reviewed_by: 'AdminAPI' }),
    });
    const approveData = await approveRes.json();
    if (!approveRes.ok || !approveData.success) {
      throw new Error(`HTTP approval failed: ${approveData.error}`);
    }
    console.log(`✓ HTTP approval succeeded! Message: "${approveData.message}"`);
    console.log(`✓ Payment status: ${approveData.payment.status}`);
    console.log(`✓ Subscriber expiry date: ${approveData.subscriber.verified_expiry_date}`);

    // 5. Try duplicate approval and verify 409 Conflict
    console.log('\n5. Testing duplicate approval over HTTP (must fail with 409/error)...');
    const dupRes = await fetch(`http://127.0.0.1:3098/api/admin/payments/${encodeURIComponent(paymentId)}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ admin_notes: 'Duplicate click', reviewed_by: 'AdminAPI' }),
    });
    const dupData = await dupRes.json();
    console.log(`✓ Response status: ${dupRes.status}, error: "${dupData.error}"`);
    if (dupRes.status !== 409 && dupRes.status !== 400) {
      throw new Error(`Expected 409 or 400 status on duplicate approval, got ${dupRes.status}`);
    }

    console.log('\n====================================================');
    console.log('ALL HTTP REST API TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================');
  } finally {
    server.close();
  }
}

testHttpEndpoints().catch((err) => {
  console.error('\n❌ HTTP TEST FAILED:', err);
  process.exit(1);
});
