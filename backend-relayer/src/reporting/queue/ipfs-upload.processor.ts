import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { IpfsService } from '../../ipfs/ipfs.service';
import { IpfsUploadJobData, QueuedImage } from './report-job.interface';
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
 * Stage 2/3: off-chain storage.
 *
 * Also safe to run with concurrency > 1 -- each job independently uploads a
 * complaint bundle to the IPFS node and gets back a content-addressed CID.
 */
@Injectable()
export class IpfsUploadProcessorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(IpfsUploadProcessorService.name);
  private worker: Worker<IpfsUploadJobData>;

  constructor(
    private readonly ipfsService: IpfsService,
    private readonly reportQueueService: ReportQueueService,
    private readonly reportStatusService: ReportStatusService,
  ) {}

  onModuleInit() {
    const concurrency =
      parseInt(process.env.IPFS_QUEUE_CONCURRENCY || '', 10) || 5;

    this.worker = new Worker<IpfsUploadJobData>(
      REPORT_QUEUES.IPFS_UPLOAD,
      async (job: Job<IpfsUploadJobData>) => {
        const jobData = job.data;
        this.logger.log(
          `Uploading report ${jobData.reportId} to IPFS (job ${job.id})`,
        );

        await this.reportStatusService.setStage(
          jobData.reportId,
          'uploading_to_ipfs',
        );

        const result = await this.ipfsService.uploadComplaint({
          description: jobData.description,
          category: jobData.category,
          location: jobData.location,
          images: toMulterFiles(jobData.images),
        });

        await this.reportQueueService.enqueueChainSubmit({
          kind: 'submit-report',
          reportId: jobData.reportId,
          ipfsCID: result.ipfsUri,
          messageHash: jobData.messageHash,
          zkpTicketId: jobData.zkpTicketId,
          citizenPseudonym: jobData.citizenPseudonym,
        });

        return { cid: result.cid };
      },
      { connection: getRedisConnectionOptions(), concurrency },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`IPFS upload job ${job?.id} failed: ${err.message}`);
      if (job) {
        void this.reportStatusService.setStage(job.data.reportId, 'failed', {
          error: err.message,
        });
      }
    });

    this.logger.log(`IPFS upload worker started (concurrency: ${concurrency})`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
