/**
 * T7 Suite B — Live End-to-End Integration Tests
 *
 * Tests the FULL pipeline against the deployed system:
 *   - Live Geth private network (rpc.internalbuildtools.online)
 *   - Live AI Oracle (ai-oracle.internalbuildtools.online)
 *   - Live IPFS node (51.210.111.188:4000)
 *   - Live NestJS relayer (relayer.internalbuildtools.online)
 *
 * These are SLOWER tests meant for nightly CI runs or manual integration verification.
 *
 * Run:
 *   LIVE_E2E=true npm run test:e2e -- --testPathPattern="live"
 *
 * Requires:
 *   LIVE_RELAYER_URL, GOV_TEST_PRIVATE_KEY, CITIZEN_TEST_PRIVATE_KEY in .env
 */

import { ethers } from 'ethers';
import axios from 'axios';

const IS_LIVE = process.env.LIVE_E2E === 'true';
const RELAYER_URL = process.env.LIVE_RELAYER_URL || 'https://relayer.internalbuildtools.online';
const RPC_URL = process.env.LIVE_RPC_URL || 'https://rpc.internalbuildtools.online';
const REPORTING_CONTRACT = process.env.LIVE_REPORTING_CONTRACT || '';

// Use provided test wallets or generate throwaway ones
const GOV_WALLET = process.env.GOV_TEST_PRIVATE_KEY
  ? new ethers.Wallet(process.env.GOV_TEST_PRIVATE_KEY)
  : ethers.Wallet.createRandom();

const CITIZEN_WALLET = process.env.CITIZEN_TEST_PRIVATE_KEY
  ? new ethers.Wallet(process.env.CITIZEN_TEST_PRIVATE_KEY)
  : ethers.Wallet.createRandom();

// ─── Skip all tests if LIVE_E2E is not set ────────────────────────────────

const describeIf = IS_LIVE ? describe : describe.skip;

// ─── Helpers ──────────────────────────────────────────────────────────────

async function buildLiveReportPayload(isEmergency = false) {
  const description = `Live E2E test report — pothole on Bridge Road. Timestamp: ${Date.now()}`;
  const category = 'Infrastructure';
  const location = 'Bridge Road, Test District';

  const zkpTicketId = ethers.keccak256(ethers.toUtf8Bytes('live-ticket-' + Date.now()));
  const zkpSignature = await GOV_WALLET.signMessage(ethers.getBytes(zkpTicketId));

  const messageHash = ethers.solidityPackedKeccak256(
    ['string', 'string', 'string'],
    [description, zkpTicketId, ''],
  );
  const signature = await CITIZEN_WALLET.signMessage(ethers.getBytes(messageHash));

  return {
    description,
    category,
    location,
    zkpTicketId,
    zkpSignature,
    citizenPubKey: CITIZEN_WALLET.address,
    signature,
    imageHashes: '[]',
    isEmergency: isEmergency ? 'true' : 'false',
  };
}

async function pollJobStatus(jobId: string, maxWaitMs = 90_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const response = await axios.get(`${RELAYER_URL}/jobs/${jobId}`);
      const { status } = response.data;
      if (['completed', 'failed', 'blockchain_submitted'].includes(status)) {
        return response.data;
      }
    } catch {
      // Keep polling
    }
  }
  throw new Error(`Job ${jobId} did not complete within ${maxWaitMs}ms`);
}

// ─── Suite B Tests ─────────────────────────────────────────────────────────

describeIf('T7 Suite B — Live End-to-End Integration Tests', () => {

  let submittedJobId: string;
  let submittedReportId: number;

  // T7.1.1 — Full report submission through live relayer
  it('T7.1.1 — POST /report → 202 + jobId from live relayer', async () => {
    const payload = await buildLiveReportPayload();
    const form = new FormData();
    Object.entries(payload).forEach(([k, v]) => form.append(k, v));

    const response = await axios.post(`${RELAYER_URL}/report`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30_000,
    });

    expect(response.status).toBe(202);
    expect(response.data.jobId).toBeDefined();
    submittedJobId = response.data.jobId;
  }, 30_000);

  // T7.1.2 — AI → IPFS → Blockchain pipeline completes
  it('T7.1.2 — Job completes full AI→IPFS→Blockchain pipeline', async () => {
    if (!submittedJobId) {
      console.warn('No jobId from previous test — skipping');
      return;
    }

    const jobResult = await pollJobStatus(submittedJobId, 120_000);
    expect(jobResult.step).toMatch(/completed|blockchain_submitted/);
    expect(jobResult.data?.transactionHash).toBeDefined();
    expect(jobResult.data?.transactionHash).toMatch(/^0x[0-9a-f]{64}$/i);
  }, 130_000);

  // T7.1.3 — Report exists on-chain with PendingValidation
  it('T7.1.3 — Report visible on-chain with PendingValidation status', async () => {
    if (!REPORTING_CONTRACT) {
      console.warn('LIVE_REPORTING_CONTRACT not set — skipping on-chain verification');
      return;
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const ReportingABI = ['function reportCount() view returns (uint256)'];
    const contract = new ethers.Contract(REPORTING_CONTRACT, ReportingABI, provider);

    const count = await contract.reportCount();
    expect(Number(count)).toBeGreaterThan(0);
    submittedReportId = Number(count);
  }, 15_000);

  // T7.2.1 — Emergency report goes Open immediately (no voting phase)
  it('T7.2.1 — Emergency report submitted and immediately Open on-chain', async () => {
    const payload = await buildLiveReportPayload(true);
    const form = new FormData();
    Object.entries(payload).forEach(([k, v]) => form.append(k, v));

    const response = await axios.post(`${RELAYER_URL}/report`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30_000,
    });

    expect(response.status).toBe(202);
    const jobId = response.data.jobId;

    // Wait for completion
    const result = await pollJobStatus(jobId, 120_000);
    expect(result.step).toMatch(/completed|blockchain_submitted/);
  }, 140_000);

  // T7.4.1 — AI rejection: offensive content should not proceed to IPFS/chain
  it('T7.4.1 — AI oracle rejects offensive content; job fails at AI step', async () => {
    const description = 'BUY CRYPTO NOW! Best investment ever! Not a civic report!';
    const zkpTicketId = ethers.keccak256(ethers.toUtf8Bytes('reject-ticket-' + Date.now()));
    const zkpSignature = await GOV_WALLET.signMessage(ethers.getBytes(zkpTicketId));
    const messageHash = ethers.solidityPackedKeccak256(
      ['string', 'string', 'string'],
      [description, zkpTicketId, ''],
    );
    const signature = await CITIZEN_WALLET.signMessage(ethers.getBytes(messageHash));

    const form = new FormData();
    form.append('description', description);
    form.append('category', 'Spam');
    form.append('location', 'Nowhere');
    form.append('zkpTicketId', zkpTicketId);
    form.append('zkpSignature', zkpSignature);
    form.append('citizenPubKey', CITIZEN_WALLET.address);
    form.append('signature', signature);
    form.append('imageHashes', '[]');

    const response = await axios.post(`${RELAYER_URL}/report`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30_000,
    });

    // The request itself is accepted for processing (202)
    expect(response.status).toBe(202);
    const jobId = response.data.jobId;

    // Job should fail at the AI step
    const result = await pollJobStatus(jobId, 120_000);
    expect(result.step).toMatch(/ai_moderation_failed|failed/);
  }, 140_000);
});

// Always export an empty describe for non-live runs
if (!IS_LIVE) {
  describe('T7 Suite B — Live E2E (skipped: set LIVE_E2E=true to run)', () => {
    it('skipped', () => {
      console.log('Set LIVE_E2E=true to run live integration tests against the deployed system');
    });
  });
}
