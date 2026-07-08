import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  ModerationJobData,
  IpfsUploadJobData,
  ChainSubmitJobData,
} from './report-job.interface';
import {
  getRedisConnectionOptions,
  REPORT_QUEUES,
} from './redis-connection.util';

/**
 * moderation -> ipfs-upload -> chain-submit
 *
 * moderation and ipfs-upload are independent, stateless calls per report and
 * are safe to run concurrently. chain-submit is shared by THREE different
 * kinds of on-chain writes (report submission, citizen votes, cron
 * finalization) and must stay serialized -- they all sign with the same
 * relayer wallet, so nonce ordering has to be enforced across all of them,
 * not just within report submissions.
 */
@Injectable()
export class ReportQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ReportQueueService.name);

  readonly moderationQueue: Queue<ModerationJobData>;
  readonly ipfsUploadQueue: Queue<IpfsUploadJobData>;
  readonly chainSubmitQueue: Queue<ChainSubmitJobData>;

  constructor() {
    const connection = getRedisConnectionOptions();

    this.moderationQueue = new Queue<ModerationJobData>(
      REPORT_QUEUES.MODERATION,
      {
        connection,
      },
    );
    this.ipfsUploadQueue = new Queue<IpfsUploadJobData>(
      REPORT_QUEUES.IPFS_UPLOAD,
      {
        connection,
      },
    );
    this.chainSubmitQueue = new Queue<ChainSubmitJobData>(
      REPORT_QUEUES.CHAIN_SUBMIT,
      {
        connection,
      },
    );
  }

  async onModuleDestroy() {
    await Promise.all([
      this.moderationQueue.close(),
      this.ipfsUploadQueue.close(),
      this.chainSubmitQueue.close(),
    ]);
  }

  async enqueueModeration(jobData: ModerationJobData) {
    this.logger.log(`Enqueuing report for moderation: ${jobData.reportId}`);
    return this.moderationQueue.add('moderate-report', jobData, {
      removeOnComplete: true,
      removeOnFail: 100,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  async enqueueIpfsUpload(jobData: IpfsUploadJobData) {
    this.logger.log(`Enqueuing report for IPFS upload: ${jobData.reportId}`);
    return this.ipfsUploadQueue.add('upload-to-ipfs', jobData, {
      removeOnComplete: true,
      removeOnFail: 100,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });
  }

  /** Used for report submission, vote casting, AND cron batch finalization. */
  async enqueueChainSubmit(jobData: ChainSubmitJobData) {
    this.logger.log(`Enqueuing chain-submit job: ${jobData.kind}`);
    return this.chainSubmitQueue.add(jobData.kind, jobData, {
      removeOnComplete: true,
      removeOnFail: 100,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }
}
