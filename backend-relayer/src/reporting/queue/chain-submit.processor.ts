import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { BlockchainService } from '../../blockchain/blockchain.service';
import { ChainSubmitJobData } from './report-job.interface';
import { ReportStatusService } from './report-status.service';
import {
  getRedisConnectionOptions,
  REPORT_QUEUES,
} from './redis-connection.util';

interface ChainTxResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
}

/**
 * Stage 3/3: on-chain submission.
 *
 * Deliberately kept at concurrency 1. Report submissions, citizen votes, AND
 * the daily cron batch-finalization all sign transactions from the SAME
 * relayer wallet, so every on-chain write in the whole app -- not just
 * report submissions -- funnels through this one queue. Raising this
 * concurrency without adding explicit nonce management will cause nonce
 * collisions and dropped/stuck transactions on the PoA chain.
 */
@Injectable()
export class ChainSubmitProcessorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ChainSubmitProcessorService.name);
  private worker: Worker<ChainSubmitJobData>;

  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly reportStatusService: ReportStatusService,
  ) {}

  onModuleInit() {
    const configuredConcurrency =
      parseInt(process.env.CHAIN_QUEUE_CONCURRENCY || '', 10) || 1;

    if (configuredConcurrency > 1) {
      this.logger.warn(
        'CHAIN_QUEUE_CONCURRENCY > 1 requires explicit nonce management, which ' +
          'this relayer does not implement. Forcing concurrency to 1.',
      );
    }
    const concurrency = 1;

    this.worker = new Worker<ChainSubmitJobData>(
      REPORT_QUEUES.CHAIN_SUBMIT,
      async (job: Job<ChainSubmitJobData>) => {
        const jobData = job.data;
        this.logger.log(
          `Processing chain-submit job ${job.id} (${jobData.kind})`,
        );

        switch (jobData.kind) {
          case 'submit-report':
            return this.handleSubmitReport(jobData);
          case 'cast-vote':
            return this.handleCastVote(jobData);
          case 'batch-finalize':
            return this.handleBatchFinalize(jobData);
        }
      },
      { connection: getRedisConnectionOptions(), concurrency },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Chain-submit job ${job?.id} failed: ${err.message}`);
      const reportId =
        job &&
        (job.data.kind === 'submit-report' || job.data.kind === 'cast-vote')
          ? job.data.reportId
          : undefined;
      if (reportId) {
        void this.reportStatusService.setStage(reportId, 'failed', {
          error: err.message,
        });
      }
    });

    this.logger.log(
      `Chain-submit worker started (concurrency: ${concurrency})`,
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async handleSubmitReport(
    jobData: Extract<ChainSubmitJobData, { kind: 'submit-report' }>,
  ) {
    await this.reportStatusService.setStage(
      jobData.reportId,
      'submitting_to_chain',
      {
        ipfsCID: jobData.ipfsCID,
      },
    );

    const result = (await this.blockchainService.submitReportToChain(
      jobData.ipfsCID,
      jobData.messageHash,
      jobData.zkpTicketId,
      jobData.citizenPseudonym,
    )) as ChainTxResult;

    await this.reportStatusService.setStage(jobData.reportId, 'confirmed', {
      ipfsCID: jobData.ipfsCID,
      txHash: result.transactionHash,
      blockNumber: result.blockNumber,
    });

    return result;
  }

  private async handleCastVote(
    jobData: Extract<ChainSubmitJobData, { kind: 'cast-vote' }>,
  ) {
    await this.reportStatusService.setStage(
      jobData.reportId,
      'submitting_to_chain',
    );

    const result = (await this.blockchainService.castVoteOnChain(
      jobData.onChainReportId,
      jobData.votePhase,
      jobData.zkpTicketId,
      jobData.decision,
    )) as ChainTxResult;

    await this.reportStatusService.setStage(jobData.reportId, 'confirmed', {
      txHash: result.transactionHash,
      blockNumber: result.blockNumber,
    });

    return result;
  }

  private async handleBatchFinalize(
    jobData: Extract<ChainSubmitJobData, { kind: 'batch-finalize' }>,
  ) {
    await this.blockchainService.batchFinalizeOnChain(jobData.reportIds);
    return { finalized: jobData.reportIds.length };
  }
}
