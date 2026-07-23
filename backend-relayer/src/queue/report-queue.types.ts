// ─── Image serialization ────────────────────────────────────────────────────
// Multer buffers cannot be stored directly in Redis (which only holds JSON),
// so we base64-encode them before enqueueing and restore them in the worker.

export interface SerializedImage {
  buffer: string;       // base64-encoded file content
  originalname: string;
  mimetype: string;
  size: number;
}

// ─── Job data (stored in Redis) ──────────────────────────────────────────────

export interface ReportJobData {
  /** Citizen's Ethereum wallet address — used to route SSE events */
  citizenPubKey: string;

  // ── Report content ──
  description: string;
  category: string;
  location: string;

  // ── Cryptographic proofs (already verified before enqueueing) ──
  zkpTicketId: string;
  zkpSignature: string;
  signature: string;
  imageHashes: string;  // JSON-serialised string[]

  // ── Pre-computed by the validation step ──
  citizenPseudonym: string;
  messageHash: string;

  // ── Serialised images ──
  images: SerializedImage[];
}

// ─── Job Names for Flow Nodes ────────────────────────────────────────────────
export const STEP_JOB_NAMES = {
  AI_MODERATION: 'step1-ai-moderation',
  IPFS_UPLOAD: 'step2-ipfs-upload',
  BLOCKCHAIN_SUBMIT: 'step3-blockchain-submit',
  REPORT_SUMMARY: 'report-summary',
} as const;

// ─── Step Results (returned by child workers) ────────────────────────────────

export interface AiStepResult {
  isApproved: boolean;
  reason?: string;
  blurredMedia?: { file_name: string; base64: string }[];
}

export interface IpfsStepResult {
  cid: string;
  ipfsUri: string;
}

export interface BlockchainStepResult {
  transactionHash: string;
  blockNumber: number;
}

// ─── Job status ──────────────────────────────────────────────────────────────

export type ReportJobStatus =
  | 'pending'
  | 'ai_moderation_in_progress'
  | 'ai_moderation_passed'
  | 'ai_moderation_failed'
  | 'ipfs_uploading'
  | 'ipfs_uploaded'
  | 'ipfs_failed'
  | 'blockchain_submitting'
  | 'blockchain_submitted'
  | 'blockchain_failed'
  | 'completed'
  | 'failed';

// ─── Progress payload (emitted via EventEmitter2 → SSE) ──────────────────────

export interface ReportJobProgress {
  jobId: string;
  citizenPubKey: string;
  step: ReportJobStatus;
  percent: number;
  message: string;
  /** Optional extra payload: txHash, blockNumber, ipfsCID, rejection reason, etc. */
  data?: Record<string, any>;
}

// ─── Event name constant ─────────────────────────────────────────────────────
export const REPORT_JOB_PROGRESS_EVENT = 'report.job.progress';
