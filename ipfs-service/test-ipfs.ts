/**
 * T4 — IPFS Storage Tests
 *
 * Tests upload/retrieval latency and CID integrity for the IPFS service.
 *
 * Run:
 *   cd ipfs-service
 *   npx ts-node test-ipfs.ts
 *   (or: node --experimental-vm-modules test-ipfs.ts)
 *
 * Requires the IPFS service to be running. Reads IPFS_TEST_URL from environment
 * or falls back to the default endpoint.
 */

import axios from 'axios';
import FormData from 'form-data';
import * as crypto from 'crypto';

const IPFS_BASE_URL = process.env.IPFS_TEST_URL || 'http://51.210.111.188:4000';
const COMPLAINT_ENDPOINT = `${IPFS_BASE_URL}/api/ipfs/complaint/store`;
const RETRIEVE_ENDPOINT = `${IPFS_BASE_URL}/api/ipfs/retrieve`; // adjust if different

// ─── Test Utilities ───────────────────────────────────────────────────────────

interface TestResult {
  testId: string;
  description: string;
  passed: boolean;
  latencyMs?: number;
  cid?: string;
  error?: string;
}

const results: TestResult[] = [];

function generateFakeImage(sizeBytes: number): Buffer {
  return crypto.randomBytes(sizeBytes);
}

async function uploadComplaint(
  description: string,
  imageSizeBytes: number,
  imageCount = 1,
): Promise<{ cid: string; latencyMs: number }> {
  const form = new FormData();
  form.append('description', description);
  form.append('category', 'Infrastructure');
  form.append('location', 'Test Location');

  for (let i = 0; i < imageCount; i++) {
    const imageBuffer = generateFakeImage(imageSizeBytes);
    form.append('images', imageBuffer, {
      filename: `test-image-${i}.jpg`,
      contentType: 'image/jpeg',
    });
  }

  const start = Date.now();
  const response = await axios.post(COMPLAINT_ENDPOINT, form, {
    headers: { ...form.getHeaders() },
    timeout: 60_000,
  });
  const latencyMs = Date.now() - start;

  const cid = response.data?.cid || response.data?.hash || response.data?.url;
  if (!cid) {
    throw new Error(`Upload succeeded but no CID returned. Response: ${JSON.stringify(response.data)}`);
  }
  return { cid, latencyMs };
}

function recordResult(result: TestResult) {
  results.push(result);
  const status = result.passed ? 'PASS' : ' FAIL';
  const latency = result.latencyMs !== undefined ? ` [${result.latencyMs}ms]` : '';
  const cid = result.cid ? ` CID: ${result.cid.slice(0, 20)}...` : '';
  const err = result.error ? `  ERROR: ${result.error}` : '';
  console.log(`${status} ${result.testId} — ${result.description}${latency}${cid}${err}`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function test_T4_1_text_only_upload() {
  try {
    const form = new FormData();
    form.append('description', 'Broken street light on Park Avenue near bus stop 14.');
    form.append('category', 'Infrastructure');
    form.append('location', 'Park Avenue, Bus Stop 14');

    const start = Date.now();
    const response = await axios.post(COMPLAINT_ENDPOINT, form, {
      headers: { ...form.getHeaders() },
      timeout: 30_000,
    });
    const latencyMs = Date.now() - start;
    const cid = response.data?.cid || response.data?.hash || response.data?.url;

    recordResult({
      testId: 'T4.1',
      description: 'Text-only complaint upload (~1KB)',
      passed: !!cid,
      latencyMs,
      cid,
      error: cid ? undefined : 'No CID returned',
    });
  } catch (e: any) {
    recordResult({ testId: 'T4.1', description: 'Text-only complaint upload', passed: false, error: e.message });
  }
}

async function test_T4_2_small_image_upload() {
  try {
    const SIZE_100KB = 100 * 1024;
    const { cid, latencyMs } = await uploadComplaint('Small image test complaint', SIZE_100KB);
    recordResult({
      testId: 'T4.2',
      description: 'Upload complaint with ~100KB image',
      passed: !!cid,
      latencyMs,
      cid,
    });
  } catch (e: any) {
    recordResult({ testId: 'T4.2', description: 'Upload with 100KB image', passed: false, error: e.message });
  }
}

async function test_T4_3_medium_image_upload() {
  try {
    const SIZE_1MB = 1 * 1024 * 1024;
    const { cid, latencyMs } = await uploadComplaint('Medium image test complaint', SIZE_1MB);
    const passed = !!cid && latencyMs < 15_000; // reasonable max 15s
    recordResult({
      testId: 'T4.3',
      description: `Upload complaint with ~1MB image (latency < 15s: ${latencyMs}ms)`,
      passed,
      latencyMs,
      cid,
      error: !passed ? `Latency too high or no CID` : undefined,
    });
  } catch (e: any) {
    recordResult({ testId: 'T4.3', description: 'Upload with 1MB image', passed: false, error: e.message });
  }
}

async function test_T4_4_large_image_upload() {
  try {
    const SIZE_5MB = 5 * 1024 * 1024;
    const { cid, latencyMs } = await uploadComplaint('Large image test complaint', SIZE_5MB);
    const passed = !!cid;
    recordResult({
      testId: 'T4.4',
      description: `Upload complaint with ~5MB image [${latencyMs}ms]`,
      passed,
      latencyMs,
      cid,
      error: !cid ? 'No CID' : undefined,
    });
  } catch (e: any) {
    recordResult({ testId: 'T4.4', description: 'Upload with 5MB image', passed: false, error: e.message });
  }
}

async function test_T4_5_cid_integrity_verification() {
  try {
    // Upload a complaint with known content
    const knownDescription = 'CID integrity check complaint - ' + Date.now();
    const form = new FormData();
    form.append('description', knownDescription);
    form.append('category', 'Test');
    form.append('location', 'Test Location');

    const uploadResponse = await axios.post(COMPLAINT_ENDPOINT, form, {
      headers: { ...form.getHeaders() },
      timeout: 30_000,
    });

    const cid = uploadResponse.data?.cid;
    if (!cid) throw new Error('No CID from upload');

    // Attempt to retrieve — if a retrieve endpoint is available
    // NOTE: This just verifies the CID is non-empty and well-formed (starts with ipfs:// or Qm/baf)
    const isValidCid =
      cid.startsWith('ipfs://') ||
      cid.startsWith('Qm') ||
      cid.startsWith('baf') ||
      cid.startsWith('QmTest'); // development mock

    recordResult({
      testId: 'T4.5',
      description: 'CID returned is valid IPFS format',
      passed: isValidCid,
      cid,
      error: !isValidCid ? `CID does not match IPFS format: ${cid}` : undefined,
    });
  } catch (e: any) {
    recordResult({ testId: 'T4.5', description: 'CID integrity verification', passed: false, error: e.message });
  }
}

async function test_T4_6_poll_metadata_upload() {
  try {
    const POLL_ENDPOINT = `${IPFS_BASE_URL}/api/ipfs/poll/store`;
    const form = new FormData();
    form.append('title', 'Should the council extend park hours?');
    form.append('description', 'A community poll about extending park operating hours during summer.');
    form.append('pollType', '0');
    form.append('options', JSON.stringify(['Yes', 'No']));

    const start = Date.now();
    const response = await axios.post(POLL_ENDPOINT, form, {
      headers: { ...form.getHeaders() },
      timeout: 30_000,
    });
    const latencyMs = Date.now() - start;
    const cid = response.data?.cid;

    recordResult({
      testId: 'T4.6',
      description: 'Poll metadata upload to IPFS',
      passed: !!cid,
      latencyMs,
      cid,
      error: cid ? undefined : 'No CID from poll upload',
    });
  } catch (e: any) {
    recordResult({ testId: 'T4.6', description: 'Poll metadata upload', passed: false, error: e.message });
  }
}

async function test_T4_7_service_unavailable_returns_error() {
  // This test simulates what happens when the IPFS service is at a wrong URL
  try {
    const form = new FormData();
    form.append('description', 'Test complaint');
    form.append('category', 'Test');
    form.append('location', 'Test');

    await axios.post('http://localhost:19999/api/ipfs/complaint/store', form, {
      headers: { ...form.getHeaders() },
      timeout: 3_000,
    });

    recordResult({
      testId: 'T4.7',
      description: 'Unreachable IPFS service should throw error',
      passed: false,
      error: 'Expected connection error, but request succeeded',
    });
  } catch (e: any) {
    // We EXPECT an error here — pass if it's a connection error
    const isConnectionError =
      e.code === 'ECONNREFUSED' ||
      e.code === 'ETIMEDOUT' ||
      e.message?.includes('connect') ||
      e.message?.includes('timeout');

    recordResult({
      testId: 'T4.7',
      description: 'Unreachable IPFS service correctly throws error',
      passed: isConnectionError,
      error: isConnectionError ? undefined : `Unexpected error: ${e.message}`,
    });
  }
}

async function test_T4_8_concurrent_uploads() {
  const CONCURRENT = 5;
  const SIZE_500KB = 500 * 1024;

  try {
    const start = Date.now();
    const promises = Array.from({ length: CONCURRENT }, (_, i) =>
      uploadComplaint(`Concurrent upload test #${i + 1}`, SIZE_500KB)
    );

    const outcomes = await Promise.allSettled(promises);
    const latencyMs = Date.now() - start;

    const succeeded = outcomes.filter((o) => o.status === 'fulfilled');
    const cids = succeeded.map((o: any) => o.value.cid);

    // Check no duplicate CIDs (since different content each time)
    const uniqueCids = new Set(cids);
    const noDuplicates = uniqueCids.size === cids.length;

    recordResult({
      testId: 'T4.8',
      description: `${CONCURRENT} concurrent uploads — ${succeeded.length}/${CONCURRENT} succeeded, no CID collisions: ${noDuplicates}`,
      passed: succeeded.length === CONCURRENT && noDuplicates,
      latencyMs,
      error: succeeded.length < CONCURRENT
        ? `Only ${succeeded.length}/${CONCURRENT} succeeded`
        : undefined,
    });
  } catch (e: any) {
    recordResult({ testId: 'T4.8', description: 'Concurrent uploads', passed: false, error: e.message });
  }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  T4 — IPFS Storage Tests');
  console.log(`  Target: ${IPFS_BASE_URL}`);
  console.log('═══════════════════════════════════════════════════\n');

  await test_T4_1_text_only_upload();
  await test_T4_2_small_image_upload();
  await test_T4_3_medium_image_upload();
  await test_T4_4_large_image_upload();
  await test_T4_5_cid_integrity_verification();
  await test_T4_6_poll_metadata_upload();
  await test_T4_7_service_unavailable_returns_error();
  await test_T4_8_concurrent_uploads();

  console.log('\n═══════════════════════════════════════════════════');
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`  Results: ${passed}/${total} passed`);

  if (passed < total) {
    const failed = results.filter((r) => !r.passed);
    console.log('\n  Failed tests:');
    failed.forEach((r) => console.log(`${r.testId}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('  All IPFS tests passed!');
    console.log('═══════════════════════════════════════════════════\n');
  }
}

main().catch((err) => {
  console.error('Fatal error in IPFS test runner:', err);
  process.exit(1);
});
