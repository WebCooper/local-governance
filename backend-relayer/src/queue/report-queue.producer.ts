import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ReportJobData } from './report-queue.types';

export const REPORT_QUEUE_NAME = 'report-processing';
export const REPORT_STEP_QUEUE_NAME = 'report-step-processing';
export const REPORT_JOB_NAME = 'process-report';

@Injectable()
export class ReportQueueProducer {
  private readonly logger = new Logger(ReportQueueProducer.name);

  constructor(
    @InjectQueue(REPORT_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  async addReportJob(data: ReportJobData): Promise<string> {
    const ticketSnippet = data.zkpTicketId ? `${data.zkpTicketId.slice(0, 10)}…` : 'no-ticket';
    const citizenSnippet = data.citizenPubKey ? `${data.citizenPubKey.slice(0, 6)}…` : 'anon';
    const jobName = `Report [${data.category}] (${ticketSnippet}) - ${citizenSnippet}`;

    const job = await this.queue.add(jobName, data, {
      // The processor handles per-step retries internally with backoff.
      // At the top BullMQ level we only allow 1 attempt so a processor
      // exception doesn't cause the whole job to silently restart.
      attempts: 1,
      removeOnComplete: { age: 86_400 }, // keep for 24 h
      removeOnFail: { age: 86_400 },     // keep for 24 h
    });

    this.logger.log(
      `Enqueued report job '${jobName}' (ID: ${job.id}) for citizen ${citizenSnippet}`,
    );

    return job.id as string;
  }
}
