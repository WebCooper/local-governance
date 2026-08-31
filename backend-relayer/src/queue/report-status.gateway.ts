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
import { Queue } from 'bullmq';
import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import {
  REPORT_JOB_PROGRESS_EVENT,
} from './report-queue.types';
import type { ReportJobProgress } from './report-queue.types';
import { REPORT_QUEUE_NAME } from './report-queue.producer';

@Controller('report')
export class ReportStatusGateway {
  private readonly logger = new Logger(ReportStatusGateway.name);

  /** Single Subject that receives all progress events from every worker job */
  private readonly progressSubject = new Subject<ReportJobProgress>();

  constructor(
    @InjectQueue(REPORT_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  // ── EventEmitter2 listener ─────────────────────────────────────────────────
  // The processor emits REPORT_JOB_PROGRESS_EVENT; we pipe it into the Subject
  // so any active SSE subscriber can receive it.
  @OnEvent(REPORT_JOB_PROGRESS_EVENT)
  handleProgressEvent(progress: ReportJobProgress) {
    this.progressSubject.next(progress);
  }

  // ── SSE endpoint ───────────────────────────────────────────────────────────
  // Citizens connect here using their wallet address.
  // They receive real-time updates for ALL their pending/active jobs.
  //
  // Usage: GET /report/status/stream?citizenAddress=0xABC123...
  @Sse('status/stream')
  streamJobStatus(
    @Query('citizenAddress') citizenAddress: string,
  ): Observable<MessageEvent> {
    if (!citizenAddress) {
      // Return a one-shot error event immediately
      return new Observable<MessageEvent>((subscriber) => {
        subscriber.next({
          data: JSON.stringify({ error: 'citizenAddress query param is required' }),
          type: 'error',
        });
        subscriber.complete();
      });
    }

    this.logger.log(
      `SSE stream opened for citizen ${citizenAddress.slice(0, 10)}…`,
    );

    return this.progressSubject.asObservable().pipe(
      // Only forward events that belong to this citizen
      filter((p) => p.citizenPubKey.toLowerCase() === citizenAddress.toLowerCase()),
      map(
        (p): MessageEvent => ({
          data: JSON.stringify(p),
          type: 'report-progress',
          id: `${p.jobId}-${p.step}`,
        }),
      ),
    );
  }

  // ── All jobs for a citizen (by wallet address) ─────────────────────────────
  // Allows the frontend to reload pending jobs on page refresh.
  //
  // Usage: GET /report/status/citizen/:address
  @Get('status/citizen/:address')
  async getCitizenJobs(@Param('address') address: string) {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getJobs(['waiting']),
      this.queue.getJobs(['active']),
      this.queue.getJobs(['completed']),
      this.queue.getJobs(['failed']),
    ]);

    const all = [...waiting, ...active, ...completed, ...failed];

    const citizenJobs = all
      .filter(
        (job) =>
          job.data?.citizenPubKey?.toLowerCase() === address.toLowerCase() &&
          String(job.id).startsWith('rpt_') &&
          !String(job.id).includes('-'),
      )
      .map(async (job) => {
        const state = await job.getState();
        const failedReason = job.failedReason ?? null;

        let step: string = 'pending';
        if (state === 'completed') {
          step = 'completed';
        } else if (state === 'failed') {
          if (failedReason?.includes('AI_REJECTED') || failedReason?.includes('oracle')) {
            step = 'ai_moderation_failed';
          } else if (failedReason?.includes('IPFS_FAILED')) {
            step = 'ipfs_failed';
          } else if (failedReason?.includes('BLOCKCHAIN_FAILED')) {
            step = 'blockchain_failed';
          } else {
            step = 'failed';
          }
        } else if (state === 'active') {
          step = 'ai_moderation_in_progress';
        }

        return {
          jobId: job.id,
          state,
          step,
          progress: job.progress,
          failedReason,
          category: job.data?.category || 'Report',
          timestamp: job.timestamp,
        };
      });

    return { jobs: await Promise.all(citizenJobs) };
  }

  // ── One-shot polling — current status of a specific job ───────────────────
  // Useful when SSE connection was lost and the citizen refreshes the page.
  //
  // Usage: GET /report/status/:jobId
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
      state,          // 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
      progress,       // last emitted percent (number)
      data: job.data, // full job data (omit sensitive fields if needed)
      result: job.returnvalue ?? null,
      failedReason: job.failedReason ?? null,
    };
  }
}
