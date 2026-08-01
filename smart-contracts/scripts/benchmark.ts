/**
 * T5 — Blockchain Network Performance Benchmark
 *
 * Measures:
 *   T5.1 — Transaction throughput (TPS)
 *   T5.2 — End-to-end submission latency (submit → confirmed)
 *   T5.3 — Clique block time observation
 *   T5.4 — Gas usage per submitReport()
 *   T5.5 — Gas usage per castValidationVote()
 *   T5.6 — batchFinalizeVotingWindows() gas for 50 reports
 *
 * Run against the live private Geth network:
 *   cd smart-contracts
 *   npx hardhat run scripts/benchmark.ts --network gethPrivate
 *
 * Or against a local Hardhat node (faster, for CI):
 *   npx hardhat run scripts/benchmark.ts --network hardhatMainnet
 */

import hre from 'hardhat';
import { ethers } from 'ethers';

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function log(label: string, value: string | number) {
  console.log(`  ${CYAN}${label.padEnd(45)}${RESET} ${GREEN}${value}${RESET}`);
}

function header(title: string) {
  console.log(`\n${BOLD}${YELLOW}  ── ${title} ──${RESET}`);
}

async function main() {
  const connection = await (hre.network as any).connect();
  const { ethers: hethers } = connection;

  const signers = await hethers.getSigners();
  const deployer = signers[0];
  const relayer = signers[1] || deployer;
  const authority = signers[2] || deployer;

  console.log(`\n${BOLD}═══════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  T5 — Blockchain Performance Benchmark${RESET}`);
  console.log(`  Network: ${(hre as any).network?.name ?? 'unknown'}`)
  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  Relayer: ${relayer.address}`);
  console.log(`  Authority: ${authority.address}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════${RESET}`);

  // ─── Deploy contracts ─────────────────────────────────────────────────────
  header('Deploying Contracts');
  const ReportingFactory = await hethers.getContractFactory('Reporting');
  const reporting = await ReportingFactory.connect(deployer).deploy();
  await reporting.waitForDeployment();
  console.log(`  Reporting deployed: ${await reporting.getAddress()}`);

  await reporting.connect(deployer).setRelayer(relayer.address, true);
  await reporting.connect(deployer).setAuthority(authority.address, true);
  await reporting.connect(deployer).setVotingWindowDuration(60); // 60 seconds for speed

  // ─── T5.4 — Gas: submitReport ─────────────────────────────────────────────
  header('T5.4 — Gas per submitReport()');
  const gasReports: bigint[] = [];
  for (let i = 0; i < 5; i++) {
    const nullifier = hethers.keccak256(hethers.toUtf8Bytes(`gas-nul-${i}`));
    const pseudonym = hethers.keccak256(hethers.toUtf8Bytes(`gas-pseudo-${i}`));
    const tx = await reporting.connect(relayer).submitReport(
      `QmGasTest${i}`,
      hethers.keccak256(hethers.toUtf8Bytes(`hash-${i}`)),
      nullifier,
      pseudonym,
    );
    const receipt = await tx.wait();
    gasReports.push(receipt.gasUsed);
  }
  const avgGasSubmit = gasReports.reduce((a, b) => a + b, 0n) / BigInt(gasReports.length);
  log('Avg gas per submitReport()', `${avgGasSubmit.toString()} gas`);

  // ─── T5.2 — End-to-End Latency ───────────────────────────────────────────
  header('T5.2 — End-to-End Submission Latency');
  const latencies: number[] = [];
  for (let i = 5; i < 10; i++) {
    const nullifier = hethers.keccak256(hethers.toUtf8Bytes(`lat-nul-${i}`));
    const pseudonym = hethers.keccak256(hethers.toUtf8Bytes(`lat-pseudo-${i}`));
    const tStart = Date.now();
    const tx = await reporting.connect(relayer).submitReport(
      `QmLatTest${i}`,
      hethers.keccak256(hethers.toUtf8Bytes(`lat-hash-${i}`)),
      nullifier,
      pseudonym,
    );
    await tx.wait();
    const latMs = Date.now() - tStart;
    latencies.push(latMs);
    console.log(`    Report ${i}: ${latMs}ms`);
  }
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const maxLatency = Math.max(...latencies);
  const minLatency = Math.min(...latencies);
  log('Average latency (submit → confirmed)', `${avgLatency.toFixed(0)}ms`);
  log('Min / Max latency', `${minLatency}ms / ${maxLatency}ms`);

  // ─── T5.1 — TPS Benchmark ─────────────────────────────────────────────────
  header('T5.1 — Transaction Throughput (TPS)');
  const TPS_BATCH = 20;
  const tpsNullifiers = Array.from({ length: TPS_BATCH }, (_, i) =>
    hethers.keccak256(hethers.toUtf8Bytes(`tps-nul-${i}-${Date.now()}`))
  );
  const tpsPseudonyms = Array.from({ length: TPS_BATCH }, (_, i) =>
    hethers.keccak256(hethers.toUtf8Bytes(`tps-pseudo-${i}`))
  );

  const baseNonce = await hethers.provider.getTransactionCount(relayer.address, 'pending');
  const feeData = await hethers.provider.getFeeData();
  const tpsStart = Date.now();
  const txs = [];
  for (let i = 0; i < TPS_BATCH; i++) {
    const txOptions: any = { nonce: baseNonce + i };
    if (feeData.maxFeePerGas) {
      txOptions.maxFeePerGas = feeData.maxFeePerGas * 2n;
      txOptions.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 1500000000n;
    }
    const tx = await reporting.connect(relayer).submitReport(
      `QmTpsTest${i}`,
      hethers.keccak256(hethers.toUtf8Bytes(`tps-hash-${i}`)),
      tpsNullifiers[i],
      tpsPseudonyms[i],
      txOptions
    );
    txs.push(tx);
  }
  const tpsElapsedMs = Date.now() - tpsStart;

  const receipts = await Promise.all(txs.map((tx: any) => tx.wait()));

  const confirmedCount = receipts.filter((r: any) => r?.status === 1).length;
  const tpsAtSubmission = (TPS_BATCH / (tpsElapsedMs / 1000)).toFixed(2);
  log('Transactions submitted', TPS_BATCH.toString());
  log('Confirmed transactions', confirmedCount.toString());
  log('Elapsed time', `${tpsElapsedMs}ms`);
  log('Throughput (submit rate)', `${tpsAtSubmission} TPS`);

  // ─── T5.3 — Observe Block Times ───────────────────────────────────────────
  header('T5.3 — Clique Block Time Observation');
  const blockIntervals: number[] = [];
  let lastBlockNumber = -1;
  let lastBlockTime = -1;

  const provider = hethers.provider;
  const latestBlock = await provider.getBlock('latest');
  if (latestBlock) {
    lastBlockNumber = latestBlock.number;
    lastBlockTime = latestBlock.timestamp;
  }

  // Wait for 3 more blocks (poll)
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));
    const block = await provider.getBlock('latest');
    if (block && block.number > lastBlockNumber) {
      if (lastBlockTime > 0) {
        const interval = block.timestamp - lastBlockTime;
        blockIntervals.push(interval);
        console.log(`    Block #${block.number}: +${interval}s since last block`);
      }
      lastBlockNumber = block.number;
      lastBlockTime = block.timestamp;
      if (blockIntervals.length >= 3) break;
    }
  }

  if (blockIntervals.length > 0) {
    const avgBlockTime = blockIntervals.reduce((a, b) => a + b, 0) / blockIntervals.length;
    log('Avg Clique block interval', `${avgBlockTime.toFixed(1)}s`);
  } else {
    log('Block interval', 'Could not observe (node may be local in-process)');
  }

  // ─── T5.5 — Gas: castValidationVote ──────────────────────────────────────
  header('T5.5 — Gas per castValidationVote()');
  const reportCount = Number(await reporting.reportCount());
  const firstReportId = 1; // use first submitted report

  const voteGasResults: bigint[] = [];
  for (let i = 0; i < 3; i++) {
    const voteNul = hethers.keccak256(hethers.toUtf8Bytes(`vote-nul-gas-${i}`));
    const votePseudo = hethers.keccak256(hethers.toUtf8Bytes(`vote-pseudo-gas-${i}`));
    try {
      const tx = await reporting.connect(relayer).castValidationVote(
        firstReportId,
        voteNul,
        true,
        votePseudo,
      );
      const receipt = await tx.wait();
      voteGasResults.push(receipt.gasUsed);
    } catch {
      // Window may have closed — skip
      break;
    }
  }

  if (voteGasResults.length > 0) {
    const avgVoteGas = voteGasResults.reduce((a, b) => a + b, 0n) / BigInt(voteGasResults.length);
    log('Avg gas per castValidationVote()', `${avgVoteGas.toString()} gas`);
  }

  // ─── T5.6 — batchFinalizeVotingWindows for many reports ──────────────────
  header('T5.6 — batchFinalizeVotingWindows() Gas & Execution');

  // Deploy fresh contract with very short window to test batch finalization
  const reporting2 = await ReportingFactory.connect(deployer).deploy();
  await reporting2.waitForDeployment();
  await reporting2.connect(deployer).setRelayer(relayer.address, true);
  await reporting2.connect(deployer).setVotingWindowDuration(1); // 1 second

  const BATCH_SIZE = 10;
  const batchIds: number[] = [];
  for (let i = 0; i < BATCH_SIZE; i++) {
    const nul = hethers.keccak256(hethers.toUtf8Bytes(`batch-nul-${i}-${Date.now()}`));
    const ps = hethers.keccak256(hethers.toUtf8Bytes(`batch-ps-${i}`));
    const tx = await reporting2.connect(relayer).submitReport(
      `QmBatch${i}`, hethers.keccak256(hethers.toUtf8Bytes(`bh-${i}`)), nul, ps
    );
    await tx.wait();
    batchIds.push(i + 1);
  }

  // Wait for windows to expire
  await new Promise((r) => setTimeout(r, 3000));

  const batchTx = await reporting2.batchFinalizeVotingWindows(batchIds);
  const batchReceipt = await batchTx.wait();
  log(`batchFinalizeVotingWindows(${BATCH_SIZE}) gas`, `${batchReceipt.gasUsed.toString()} gas`);
  log(`Batch gas per report`, `${(batchReceipt.gasUsed / BigInt(BATCH_SIZE)).toString()} gas`);

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}═══════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  Benchmark Complete${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════${RESET}\n`);
}

main().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
