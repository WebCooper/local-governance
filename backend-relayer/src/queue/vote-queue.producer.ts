import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { VoteJobData } from './vote-queue.types';

export const VOTE_QUEUE_NAME = 'vote-queue';

@Injectable()
export class VoteQueueProducer {
  private readonly logger = new Logger(VoteQueueProducer.name);

  constructor(
    @InjectQueue(VOTE_QUEUE_NAME) private readonly voteQueue: Queue,
  ) {}

  async addVoteJob(data: VoteJobData): Promise<string> {
    const rawTicket = data.zkpTicketId || '';
    const ticketHash = rawTicket.startsWith('0x')
      ? rawTicket.slice(2, 10)
      : rawTicket.slice(0, 8) || Math.random().toString(36).substring(2, 10);
    
    // Create a predictable unique job ID based on reportId and ticketHash to avoid duplicates
    // Also makes it easy to track
    const jobId = `vote_${data.reportId}_${ticketHash}`;

    this.logger.log(`Enqueueing vote job: ${jobId}`);

    await this.voteQueue.add('submit-vote', data, {
      jobId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: { age: 86400 }, // Keep for 24 hours
      removeOnFail: { age: 86400 },
    });

    return jobId;
  }
}
