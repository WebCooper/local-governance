export interface VoteJobData {
  reportId: string;
  votePhase: 'validation' | 'verification' | 'rejectionReview';
  decision: boolean;
  zkpTicketId: string; // The nullifier for the vote
  zkpSignature: string;
  citizenPubKey: string; // Citizen's Ethereum wallet address
  signature: string;
  pseudonym: string; // Derived pseudonym for one-vote-per-citizen
}

export type VoteJobStatus =
  | 'pending'
  | 'blockchain_submitting'
  | 'blockchain_submitted'
  | 'blockchain_failed'
  | 'completed'
  | 'failed';

export interface VoteJobProgress {
  jobId: string;
  citizenPubKey: string;
  step: VoteJobStatus;
  percent: number;
  message: string;
  data?: Record<string, any>;
}

export const VOTE_JOB_PROGRESS_EVENT = 'vote.job.progress';
