import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BlockchainService } from '../blockchain/blockchain.service';
import { ReportQueueService } from './queue/report-queue.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly reportQueueService: ReportQueueService,
  ) {}

  // Runs every hour. Adjust to CronExpression.EVERY_DAY_AT_MIDNIGHT if preferred.
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleVotingWindowFinalizations() {
    this.logger.log('CRON: Scanning for expired voting windows...');

    try {
      // Fetch recent reports to check their status
      const recentReports =
        await this.blockchainService.getLatestReportsForCron(100);
      const currentTime = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

      const expiredReportIds: number[] = [];

      for (const report of recentReports) {
        // Enums mapping based on your contract:
        // 0 = PendingValidation, 4 = PendingRejectionReview, 5 = PendingVerification
        const status = Number(report.status);
        const deadline = Number(report.phaseDeadline);

        const isVotingPhase = status === 0 || status === 4 || status === 5;
        const isExpired = deadline > 0 && currentTime > deadline;

        if (isVotingPhase && isExpired) {
          expiredReportIds.push(Number(report.id));
        }
      }

      if (expiredReportIds.length > 0) {
        this.logger.log(
          `CRON: Found ${expiredReportIds.length} expired reports. Queuing batch finalization...`,
        );
        await this.reportQueueService.enqueueChainSubmit({
          kind: 'batch-finalize',
          reportIds: expiredReportIds,
        });
      } else {
        this.logger.log(
          'CRON: No expired reports found requiring finalization.',
        );
      }
    } catch (error: any) {
      this.logger.error(`CRON Finalization failed: ${error.message}`);
    }
  }
}
