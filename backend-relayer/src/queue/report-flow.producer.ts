import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { FlowProducer } from 'bullmq';
import { REPORT_QUEUE_NAME, REPORT_STEP_QUEUE_NAME } from './report-queue.producer';
import { ReportJobData, STEP_JOB_NAMES } from './report-queue.types';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ReportFlowProducer implements OnModuleDestroy {
  private readonly logger = new Logger(ReportFlowProducer.name);
  private readonly flowProducer: FlowProducer;

  constructor(private readonly configService: ConfigService) {
    this.flowProducer = new FlowProducer({
      connection: {
        host: this.configService.get<string>('REDIS_HOST') || 'localhost',
        port: this.configService.get<number>('REDIS_PORT') || 6379,
        username: this.configService.get<string>('REDIS_USERNAME') || 'default',
        password: this.configService.get<string>('REDIS_PASSWORD'),
      },
    });
  }

  async onModuleDestroy() {
    await this.flowProducer.close();
  }

  async addReportFlow(data: ReportJobData): Promise<string> {
    // Generate clean short ticket hash for concise job IDs (no colons allowed by BullMQ)
    const rawTicket = data.zkpTicketId || '';
    const ticketHash = rawTicket.startsWith('0x')
      ? rawTicket.slice(2, 10)
      : rawTicket.slice(0, 8) || Math.random().toString(36).substring(2, 10);

    const parentJobId = `rpt_${ticketHash}`;
    const queueName = REPORT_QUEUE_NAME;
    const stepQueueName = REPORT_STEP_QUEUE_NAME;

    this.logger.log(
      `Creating report processing flow tree for parent ID: ${parentJobId}`,
    );

    // Build sequential tree: Parent -> Step 3 (Chain) -> Step 2 (IPFS) -> Step 1 (AI)
    // Execution order in BullMQ: Leaf first (Step 1 AI) -> Step 2 IPFS -> Step 3 Chain -> Parent Summary
    await this.flowProducer.add({
      name: `Report [${data.category}] - ${parentJobId}`,
      queueName,
      data,
      opts: {
        jobId: parentJobId,
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 86400 },
      },
      children: [
        {
          name: STEP_JOB_NAMES.BLOCKCHAIN_SUBMIT,
          queueName: stepQueueName,
          data,
          opts: {
            jobId: `${parentJobId}-chain`,
            attempts: 3,
            removeOnComplete: { age: 86400 },
            removeOnFail: { age: 86400 },
            failParentOnFailure: true,
          },
          children: [
            {
              name: STEP_JOB_NAMES.IPFS_UPLOAD,
              queueName: stepQueueName,
              data,
              opts: {
                jobId: `${parentJobId}-ipfs`,
                attempts: 3,
                removeOnComplete: { age: 86400 },
                removeOnFail: { age: 86400 },
                failParentOnFailure: true,
              },
              children: [
                {
                  name: STEP_JOB_NAMES.AI_MODERATION,
                  queueName: stepQueueName,
                  data,
                  opts: {
                    jobId: `${parentJobId}-ai`,
                    attempts: 1,
                    removeOnComplete: { age: 86400 },
                    removeOnFail: { age: 86400 },
                    failParentOnFailure: true,
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    this.logger.log(
      `Enqueued report flow: ${parentJobId} (AI: ${parentJobId}-ai, IPFS: ${parentJobId}-ipfs, Chain: ${parentJobId}-chain)`,
    );

    return parentJobId;
  }
}
