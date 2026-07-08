import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { getRedisConnectionOptions } from './redis-connection.util';
import { ReportStage, ReportStatusRecord } from './report-job.interface';

const STATUS_KEY_PREFIX = 'report-status:';
const STATUS_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

@Injectable()
export class ReportStatusService implements OnModuleDestroy {
  private readonly logger = new Logger(ReportStatusService.name);
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis(getRedisConnectionOptions());
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  private keyFor(reportId: string) {
    return `${STATUS_KEY_PREFIX}${reportId}`;
  }

  async setStage(
    reportId: string,
    stage: ReportStage,
    extra: Partial<ReportStatusRecord> = {},
  ): Promise<ReportStatusRecord> {
    const existingRaw = await this.redis.get(this.keyFor(reportId));
    const existing: Partial<ReportStatusRecord> = existingRaw
      ? (JSON.parse(existingRaw) as Partial<ReportStatusRecord>)
      : {};

    const record: ReportStatusRecord = {
      ...existing,
      ...extra,
      reportId,
      stage,
      updatedAt: new Date().toISOString(),
    };

    await this.redis.set(
      this.keyFor(reportId),
      JSON.stringify(record),
      'EX',
      STATUS_TTL_SECONDS,
    );

    this.logger.debug(`Status for ${reportId} -> ${stage}`);
    return record;
  }

  async getStatus(reportId: string): Promise<ReportStatusRecord | null> {
    const raw = await this.redis.get(this.keyFor(reportId));
    return raw ? (JSON.parse(raw) as ReportStatusRecord) : null;
  }
}
