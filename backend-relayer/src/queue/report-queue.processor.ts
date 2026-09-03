import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import { AiOracleService } from '../ai-oracle/ai-oracle.service';
import { IpfsService } from '../ipfs/ipfs.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { REPORT_QUEUE_NAME, REPORT_STEP_QUEUE_NAME } from './report-queue.producer';
import {
  ReportJobData,
  ReportJobProgress,
  ReportJobStatus,
  REPORT_JOB_PROGRESS_EVENT,
  SerializedImage,
  STEP_JOB_NAMES,
  AiStepResult,
  IpfsStepResult,
  BlockchainStepResult,
} from './report-queue.types';

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
    } catch (err: any) {
      lastError = err;
      if (err?.message?.includes('EMERGENCY_REPORTING_LOCKED')) {
        break;
      }
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(4, attempt - 1); // 2s, 8s, 32s
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ─── Deserialise stored images back to Multer-compatible objects ──────────────
function deserializeImages(images: SerializedImage[]): Express.Multer.File[] {
  return (images || []).map((img) => ({
    buffer: Buffer.from(img.buffer, 'base64'),
    originalname: img.originalname,
    mimetype: img.mimetype,
    size: img.size,
    fieldname: 'images',
    encoding: '7bit',
    destination: '',
    filename: img.originalname,
    path: '',
    stream: null as any,
  }));
}

// ─── Helper: Get root parent jobId for SSE routing ────────────────────────────
function getRootJobId(job: Job): string {
  const idStr = String(job.id);
  const match = idStr.match(/^(rpt_[a-f0-9]+)/i);
  if (match) {
    return match[1];
  }
  return idStr;
}

@Processor(REPORT_QUEUE_NAME)
export class ReportQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportQueueProcessor.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly aiOracleService: AiOracleService,
    private readonly ipfsService: IpfsService,
    private readonly blockchainService: BlockchainService,
  ) {
    super();
  }

  // ── Flow Router ────────────────────────────────────────────────────────────
  async process(job: Job<ReportJobData>): Promise<any> {
    const rootJobId = getRootJobId(job);
    const { citizenPubKey } = job.data;

    this.logger.log(
      `Processing flow job '${job.name}' (ID: ${job.id}, Root: ${rootJobId})`,
    );

    const emit = async (
      step: ReportJobStatus,
      percent: number,
      message: string,
      data?: Record<string, any>,
    ) => {
      const progress: ReportJobProgress = {
        jobId: rootJobId,
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
      this.eventEmitter.emit(REPORT_JOB_PROGRESS_EVENT, progress);
    };

    switch (job.name) {
      case STEP_JOB_NAMES.AI_MODERATION:
        return this.handleAiStep(job, emit);

      case STEP_JOB_NAMES.IPFS_UPLOAD:
        return this.handleIpfsStep(job, emit);

      case STEP_JOB_NAMES.BLOCKCHAIN_SUBMIT:
        return this.handleBlockchainStep(job, emit);

      default:
        // Parent Job (Summary)
        return this.handleParentSummaryStep(job, emit);
    }
  }

  // ── STEP 1: AI Moderation (Child - Leaf) ──────────────────────────────────
  private async handleAiStep(
    job: Job<ReportJobData>,
    emit: Function,
  ): Promise<AiStepResult> {
    await emit(
      'ai_moderation_in_progress',
      5,
      'Initiating AI moderation oracle inspection…',
    );

    const images = deserializeImages(job.data.images);

    const aiVerdict = await this.aiOracleService.moderateContent(
      job.data.description,
      images,
      job.data.zkpTicketId,
      job.data.signature,
      job.data.zkpSignature,
      job.data.messageHash,
    );

    if (!aiVerdict.isApproved) {
      const reason = aiVerdict.reason || 'Violates community guidelines';
      this.logger.warn(`Report job ${job.id} rejected by AI: ${reason}`);
      await emit('ai_moderation_failed', 33, 'AI moderation rejected the report.', {
        reason,
      });
      throw new Error(`AI_REJECTED: ${reason}`);
    }

    await emit(
      'ai_moderation_passed',
      33,
      'AI moderation passed. Content approved.',
    );

    return {
      isApproved: true,
      blurredMedia: aiVerdict.blurredMedia,
    };
  }

  // ── STEP 2: IPFS Upload (Child - Depends on Step 1) ───────────────────────
  private async handleIpfsStep(
    job: Job<ReportJobData>,
    emit: Function,
  ): Promise<IpfsStepResult> {
    await emit(
      'ipfs_uploading',
      40,
      'Uploading complaint bundle to IPFS network…',
    );

    // Read result from Child 1 (AI Moderation)
    const childrenValues = await job.getChildrenValues<AiStepResult>();
    const aiResult = Object.values(childrenValues)[0];

    const images = deserializeImages(job.data.images);

    // Apply blurred images if returned by AI
    if (aiResult?.blurredMedia?.length) {
      await job.log(
        `[${new Date().toISOString()}] [AI_FACE_BLUR] Applying ${aiResult.blurredMedia.length} blurred image(s) from AI oracle.`,
      );
      for (const blurred of aiResult.blurredMedia) {
        const match = images.find(
          (img) => img.originalname === blurred.file_name,
        );
        if (match) {
          match.buffer = Buffer.from(blurred.base64, 'base64');
          match.size = match.buffer.length;
        }
      }
    }

    let ipfsResult: { cid: string; ipfsUri: string; raw: any };
    try {
      ipfsResult = await withRetry(
        () =>
          this.ipfsService.uploadComplaint({
            description: job.data.description,
            category: job.data.category,
            location: job.data.location,
            images,
          }),
        3,
        2_000,
      );
    } catch (err: any) {
      this.logger.error(
        `IPFS upload failed after 3 retries for job ${job.id}: ${err.message}`,
      );
      await emit('ipfs_failed', 66, 'Failed to upload to IPFS after 3 retries.', {
        error: err.message,
      });
      throw new Error(`IPFS_FAILED: ${err.message}`);
    }

    await emit(
      'ipfs_uploaded',
      66,
      `Stored on IPFS successfully. CID: ${ipfsResult.cid}`,
      { ipfsCID: ipfsResult.cid },
    );

    return {
      cid: ipfsResult.cid,
      ipfsUri: ipfsResult.ipfsUri,
    };
  }

  // ── STEP 3: Blockchain Submission (Child - Depends on Step 2) ─────────────
  private async handleBlockchainStep(
    job: Job<ReportJobData>,
    emit: Function,
  ): Promise<BlockchainStepResult> {
    await emit(
      'blockchain_submitting',
      75,
      'Submitting report to blockchain smart contract…',
    );

    // Read result from Child 2 (IPFS Upload)
    const childrenValues = await job.getChildrenValues<IpfsStepResult>();
    const ipfsResult = Object.values(childrenValues)[0];

    if (!ipfsResult?.ipfsUri) {
      throw new Error('BLOCKCHAIN_FAILED: Missing IPFS URI from child step.');
    }

    let chainResult: Awaited<
      ReturnType<BlockchainService['submitReportToChain']>
    >;
    try {
      chainResult = await withRetry(
        () =>
          this.blockchainService.submitReportToChain(
            ipfsResult.ipfsUri,
            job.data.messageHash,
            job.data.zkpTicketId,
            job.data.citizenPseudonym,
            job.data.isEmergency ?? false,
          ),
        3,
        2_000,
      );
    } catch (err: any) {
      const isPenalty =
        err?.message?.includes('EMERGENCY_REPORTING_LOCKED') ||
        err?.message?.includes('EmergencyReportingLocked') ||
        err?.message?.includes('penalty');

      const userMessage = isPenalty
        ? 'Emergency reporting blocked: Account is currently in a 30-day penalty box for false emergency reporting.'
        : 'Failed to submit to blockchain after 3 retries.';

      this.logger.error(
        `Blockchain submission failed for job ${job.id}: ${err.message}`,
      );
      await emit(
        'blockchain_failed',
        90,
        userMessage,
        { error: err.message, isPenalty: Boolean(isPenalty) },
      );
      throw new Error(`BLOCKCHAIN_FAILED: ${userMessage}`);
    }

    await emit(
      'blockchain_submitted',
      90,
      `Transaction mined in block #${chainResult.blockNumber}`,
      {
        transactionHash: chainResult.transactionHash,
        blockNumber: chainResult.blockNumber,
      },
    );

    return {
      transactionHash: chainResult.transactionHash ?? 'N/A',
      blockNumber: chainResult.blockNumber ?? 0,
    };
  }

  // ── PARENT STEP: Summary & Completion ─────────────────────────────────────
  private async handleParentSummaryStep(
    job: Job<ReportJobData>,
    emit: Function,
  ): Promise<any> {
    const childrenValues = await job.getChildrenValues();
    this.logger.log(`Parent job ${job.id} finalizing workflow summary…`);

    const chainResult = (Object.values(childrenValues)[0] ||
      {}) as BlockchainStepResult;

    await emit(
      'completed',
      100,
      'Report successfully recorded on-chain! 🎉',
      {
        transactionHash: chainResult.transactionHash,
        blockNumber: chainResult.blockNumber,
      },
    );

    await job.log(
      `[${new Date().toISOString()}] [FLOW_COMPLETE] Report workflow fully completed for ${job.id}.`,
    );

    return {
      success: true,
      jobId: job.id,
      blockchain: chainResult,
    };
  }
}

@Processor(REPORT_STEP_QUEUE_NAME)
export class ReportStepQueueProcessor extends WorkerHost {
  constructor(private readonly mainProcessor: ReportQueueProcessor) {
    super();
  }

  async process(job: Job<ReportJobData>): Promise<any> {
    return this.mainProcessor.process(job);
  }
}

