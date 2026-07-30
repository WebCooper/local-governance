import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import { BlockchainService } from '../blockchain/blockchain.service';
import { VOTE_QUEUE_NAME } from './vote-queue.producer';
import {
  VoteJobData,
  VoteJobProgress,
  VoteJobStatus,
  VOTE_JOB_PROGRESS_EVENT,
} from './vote-queue.types';

// ─── Retry helper ─────────────────────────────────────────────────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 2_000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(4, attempt - 1); // 2s, 8s, 32s
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

@Processor(VOTE_QUEUE_NAME)
export class VoteQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(VoteQueueProcessor.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly blockchainService: BlockchainService,
  ) {
    super();
  }

  async process(job: Job<VoteJobData>): Promise<any> {
    const { citizenPubKey } = job.data;
    const jobId = String(job.id);

    this.logger.log(`Processing vote job (ID: ${jobId})`);

    const emit = async (
      step: VoteJobStatus,
      percent: number,
      message: string,
      data?: Record<string, any>,
    ) => {
      const progress: VoteJobProgress = {
        jobId,
        citizenPubKey,
        step,
        percent,
        message,
        data,
      };

      const dataStr = data ? ` | Details: ${JSON.stringify(data)}` : '';
      await job.log(
        `[${new Date().toISOString()}] [${step.toUpperCase()}] ${message}${dataStr}`,
      );

      await job.updateProgress(percent);
      this.eventEmitter.emit(VOTE_JOB_PROGRESS_EVENT, progress);
    };

    try {
      await emit(
        'blockchain_submitting',
        50,
        'Submitting vote to the blockchain…',
      );

      const txResult = await withRetry(
        () =>
          this.blockchainService.castVoteOnChain(
            Number(job.data.reportId),
            job.data.votePhase,
            job.data.zkpTicketId, // Using the ticket as the vote nullifier
            job.data.decision,
            job.data.pseudonym,
          ),
        3,
      );

      await emit('blockchain_submitted', 95, 'Vote transaction submitted successfully', {
        transactionHash: txResult.transactionHash,
      });

      await emit('completed', 100, 'Vote processing completed entirely', {
        transactionHash: txResult.transactionHash,
      });

      return {
        transactionHash: txResult.transactionHash,
      };
    } catch (error: any) {
      this.logger.error(
        `Vote job ${jobId} failed: ${error.message}`,
        error.stack,
      );

      // Handle nonce/duplicate issue based on error message mapping
      const isAlreadyVoted = error.message?.includes('already voted') || error.message?.includes('nonce') || error.message?.includes('Duplicate');
      
      const failReason = isAlreadyVoted 
        ? 'Vote already recorded or invalid nonce.' 
        : 'Blockchain submission failed. Please try again later.';

      await emit('blockchain_failed', 0, failReason, {
        error: error.message,
      });

      throw error;
    }
  }
}
