export interface QueuedImage {
  filename: string;
  mimetype: string;
  data: string; // Base64 encoded buffer
  size: number;
}

/**
 * Everything the moderation stage needs. Crypto verification (gov ticket,
 * image-hash, citizen signature) has already happened synchronously in
 * ReportingService.createReport() before this is enqueued -- only content
 * that has passed that fast, local check ever reaches the network stages.
 */
export interface ModerationJobData {
  reportId: string; // == zkpTicketId; stable id used to track status across all 3 queues
  description: string;
  category: string;
  location: string;
  zkpTicketId: string;
  zkpSignature: string;
  citizenPubKey: string;
  signature: string;
  messageHash: string; // solidityPackedKeccak256 hash computed pre-enqueue; needed by AI oracle + chain
  citizenPseudonym: string; // needed by chain submission
  images: QueuedImage[];
}

export interface IpfsUploadJobData extends ModerationJobData {
  moderation: {
    isApproved: true;
    reason?: string;
  };
}

interface SubmitReportChainJob {
  kind: 'submit-report';
  reportId: string;
  ipfsCID: string;
  messageHash: string;
  zkpTicketId: string;
  citizenPseudonym: string;
}

interface CastVoteChainJob {
  kind: 'cast-vote';
  reportId: string; // status-tracking id (uuid), distinct from the on-chain numeric reportId below
  onChainReportId: number;
  votePhase: 'validation' | 'verification' | 'rejectionReview';
  zkpTicketId: string; // used as the vote nullifier
  decision: boolean;
}

interface BatchFinalizeChainJob {
  kind: 'batch-finalize';
  reportIds: number[];
}

/**
 * All three write to the blockchain from the SAME relayer wallet, so they
 * all funnel through one queue with concurrency 1 -- report submission,
 * citizen votes, and the daily cron finalization must never race each
 * other's nonce.
 */
export type ChainSubmitJobData =
  SubmitReportChainJob | CastVoteChainJob | BatchFinalizeChainJob;

export type ReportStage =
  | 'queued'
  | 'moderating'
  | 'moderation_rejected'
  | 'uploading_to_ipfs'
  | 'submitting_to_chain'
  | 'confirmed'
  | 'failed';

export interface ReportStatusRecord {
  reportId: string;
  stage: ReportStage;
  updatedAt: string;
  ipfsCID?: string;
  txHash?: string;
  blockNumber?: number;
  moderationApproved?: boolean;
  moderationReason?: string;
  error?: string;
}
