import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { AiOracleService } from '../../ai-oracle/ai-oracle.service';
import { ModerationJobData, QueuedImage } from './report-job.interface';
import { ReportQueueService } from './report-queue.service';
import { ReportStatusService } from './report-status.service';
import {
  getRedisConnectionOptions,
  REPORT_QUEUES,
} from './redis-connection.util';

function toMulterFiles(images: QueuedImage[]): Express.Multer.File[] {
  return images.map(
    (img) =>
      ({
        buffer: Buffer.from(img.data, 'base64'),
        originalname: img.filename,
        mimetype: img.mimetype,
        size: img.size,
      }) as Express.Multer.File,
  );
}

/**
 * Stage 1/3: AI content moderation.
 *
 * Safe to run with concurrency > 1 -- each job only calls out to the
 * (already deployed, external) AI oracle aggregator and holds no shared
 * state. Tune to whatever that service can sustain.
 */
@Injectable()
export class ModerationProcessorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ModerationProcessorService.name);
  private worker: Worker<ModerationJobData>;

  constructor(
    private readonly aiOracleService: AiOracleService,
    private readonly reportQueueService: ReportQueueService,
    private readonly reportStatusService: ReportStatusService,
  ) {}

  onModuleInit() {
    const concurrency =
      parseInt(process.env.MODERATION_QUEUE_CONCURRENCY || '', 10) || 5;

    this.worker = new Worker<ModerationJobData>(
      REPORT_QUEUES.MODERATION,
      async (job: Job<ModerationJobData>) => {
        const jobData = job.data;
        this.logger.log(
          `Moderating report ${jobData.reportId} (job ${job.id})`,
        );

        await this.reportStatusService.setStage(jobData.reportId, 'moderating');

        const verdict = await this.aiOracleService.moderateContent(
          jobData.description,
          toMulterFiles(jobData.images),
          jobData.zkpTicketId,
          jobData.signature,
          jobData.zkpSignature,
          jobData.messageHash,
        );

        if (!verdict.isApproved) {
          // A REJECT verdict is a valid business outcome, not a technical
          // failure -- don't throw, or BullMQ retries the AI call pointlessly.
          await this.reportStatusService.setStage(
            jobData.reportId,
            'moderation_rejected',
            {
              moderationApproved: false,
              moderationReason: verdict.reason,
            },
          );
          this.logger.warn(
            `Report ${jobData.reportId} rejected by AI: ${verdict.reason}`,
          );
          return { isApproved: false, reason: verdict.reason };
        }

        await this.reportQueueService.enqueueIpfsUpload({
          ...jobData,
          moderation: { isApproved: true, reason: verdict.reason },
        });

        return { isApproved: true };
      },
      { connection: getRedisConnectionOptions(), concurrency },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Moderation job ${job?.id} failed: ${err.message}`);
      if (job) {
        void this.reportStatusService.setStage(job.data.reportId, 'failed', {
          error: err.message,
        });
      }
    });

    this.logger.log(`Moderation worker started (concurrency: ${concurrency})`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
