import {
  Controller,
  Get,
  Logger,
  MessageEvent,
  Param,
  Query,
  Sse,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { VOTE_QUEUE_NAME } from './vote-queue.producer';
import type { VoteJobProgress } from './vote-queue.types';
import { VOTE_JOB_PROGRESS_EVENT } from './vote-queue.types';

@Controller('vote')
export class VoteStatusGateway {
  private readonly logger = new Logger(VoteStatusGateway.name);

  /** Single Subject that receives all progress events from every worker job */
  private readonly progressSubject = new Subject<VoteJobProgress>();

  constructor(
    @InjectQueue(VOTE_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  @OnEvent(VOTE_JOB_PROGRESS_EVENT)
  handleProgressEvent(progress: VoteJobProgress) {
    this.progressSubject.next(progress);
  }

  // ── SSE endpoint ───────────────────────────────────────────────────────────
  // Usage: GET /vote/status/stream?citizenAddress=0xABC123...
  @Sse('status/stream')
  streamJobStatus(
    @Query('citizenAddress') citizenAddress: string,
  ): Observable<MessageEvent> {
    if (!citizenAddress) {
      return new Observable<MessageEvent>((subscriber) => {
        subscriber.next({
          data: JSON.stringify({ error: 'citizenAddress query param is required' }),
          type: 'error',
        });
        subscriber.complete();
      });
    }

    this.logger.log(
      `Vote SSE stream opened for citizen ${citizenAddress.slice(0, 10)}…`,
    );

    return this.progressSubject.asObservable().pipe(
      filter((p) => p.citizenPubKey.toLowerCase() === citizenAddress.toLowerCase()),
      map(
        (p): MessageEvent => ({
          data: JSON.stringify(p),
          type: 'vote-progress',
          id: `${p.jobId}-${p.step}`,
        }),
      ),
    );
  }

  // ── One-shot polling — current status of a specific job ───────────────────
  // Usage: GET /vote/status/:jobId
  @Get('status/:jobId')
  async getJobStatus(@Param('jobId') jobId: string) {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      return { found: false, jobId };
    }

    const state = await job.getState();
    const progress = job.progress;

    return {
      found: true,
      jobId,
      state,
      progress,
      data: job.data,
      result: job.returnvalue ?? null,
      failedReason: job.failedReason ?? null,
    };
  }
}
