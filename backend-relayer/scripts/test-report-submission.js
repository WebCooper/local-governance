/**
 * Smoke-test script for the reporting pipeline.
 *
 * What it does:
 *   1. Fetches a real, gov-signed test ticket from the deployed ZKP simulator
 *      (using one of its pre-seeded test citizens).
 *   2. Generates a throwaway citizen wallet locally and signs the report
 *      payload with it (this doesn't need to match the simulator's own
 *      citizenSeed scheme -- ReportingService only checks that citizenPubKey
 *      matches the recovered signer of messageHash).
 *   3. POSTs a report to your locally running backend-relayer.
 *   4. Polls /report/status/:reportId every 2s until it reaches a final
 *      state (confirmed / moderation_rejected / failed), or times out.
 *
 * Usage:
 *   cd backend-relayer
 *   node scripts/test-report-submission.js
 *
 * Requires: ethers (already a dependency of backend-relayer), Node 18+ (for
 * built-in fetch/FormData/Blob).
 */

const { ethers } = require('ethers');

const RELAYER_URL = process.env.TEST_RELAYER_URL || 'http://localhost:3000';
const ZKP_SIMULATOR_URL =
  process.env.ZKP_SIMULATOR_URL || 'https://zkp.internalbuildtools.online';

// One of the 20 pre-seeded test citizens from zkp-govid-simulator/README.md
const TEST_GOV_ID = process.env.TEST_GOV_ID || '199812345678';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '0711234567';

async function getSignedTicket() {
  console.log(`\n[1/4] Requesting a signed ticket from ${ZKP_SIMULATOR_URL} ...`);

  const res = await fetch(`${ZKP_SIMULATOR_URL}/api/govid/verify-citizen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ govId: TEST_GOV_ID, password: TEST_PASSWORD }),
  });

  if (!res.ok) {
    throw new Error(
      `ZKP simulator returned ${res.status}: ${await res.text()}. ` +
        `Check TEST_GOV_ID/TEST_PASSWORD match a seeded citizen.`,
    );
  }

  const data = await res.json();
  if (!data.success || !data.ticketBatch?.length) {
    throw new Error(`Unexpected ZKP simulator response: ${JSON.stringify(data)}`);
  }

  const { ticketId, signature } = data.ticketBatch[0];
  console.log(`      Got ticket: ${ticketId}`);
  return { zkpTicketId: ticketId, zkpSignature: signature };
}

function buildReportPayload(zkpTicketId, zkpSignature) {
  console.log('\n[2/4] Building and signing the report payload ...');

  // Throwaway wallet standing in for "the citizen" -- fine for a pipeline
  // smoke test, since verification only cares that citizenPubKey matches
  // the recovered signer below, not how the key was derived.
  const citizenWallet = ethers.Wallet.createRandom();

  const description = `[TEST] Pothole reported at ${new Date().toISOString()}`;
  const category = 'Road Damage';
  const location = '6.9271,79.8612';
  const imageHashes = []; // no images in this smoke test -- see README for the image variant

  const combinedImageHashes = imageHashes.join('');
  const messageHash = ethers.solidityPackedKeccak256(
    ['string', 'string', 'string'],
    [description, zkpTicketId, combinedImageHashes],
  );

  const signature = citizenWallet.signMessageSync(ethers.getBytes(messageHash));

  return {
    description,
    category,
    location,
    zkpTicketId,
    zkpSignature,
    citizenPubKey: citizenWallet.address,
    signature,
    imageHashes: JSON.stringify(imageHashes),
    messageHash, // not sent, just for local sanity logging
  };
}

async function submitReport(payload) {
  console.log(`\n[3/4] Submitting report to ${RELAYER_URL}/report ...`);

  const form = new FormData();
  form.append('description', payload.description);
  form.append('category', payload.category);
  form.append('location', payload.location);
  form.append('zkpTicketId', payload.zkpTicketId);
  form.append('zkpSignature', payload.zkpSignature);
  form.append('citizenPubKey', payload.citizenPubKey);
  form.append('signature', payload.signature);
  form.append('imageHashes', payload.imageHashes);
  // No 'images' field appended -- images are optional; see README for the variant with an image.

  const res = await fetch(`${RELAYER_URL}/report`, { method: 'POST', body: form });
  const body = await res.json();

  if (!res.ok) {
    throw new Error(`Relayer returned ${res.status}: ${JSON.stringify(body)}`);
  }

  console.log('      Relayer response:', JSON.stringify(body, null, 2));
  return body.data.reportId;
}

async function pollStatus(reportId) {
  console.log(`\n[4/4] Polling ${RELAYER_URL}/report/status/${reportId} ...`);

  const finalStages = ['confirmed', 'moderation_rejected', 'failed'];
  const maxAttempts = 30; // ~60s at 2s interval

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${RELAYER_URL}/report/status/${reportId}`);
    const status = await res.json();

    console.log(`      [${attempt}/${maxAttempts}] stage: ${status.stage}`);

    if (finalStages.includes(status.stage)) {
      console.log('\nFinal status:', JSON.stringify(status, null, 2));
      return status;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  console.warn('\nTimed out waiting for a final status -- check server logs and /report/queue-health.');
  return null;
}

(async () => {
  try {
    const { zkpTicketId, zkpSignature } = await getSignedTicket();
    const payload = buildReportPayload(zkpTicketId, zkpSignature);
    const reportId = await submitReport(payload);
    await pollStatus(reportId);
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
  }
})();
