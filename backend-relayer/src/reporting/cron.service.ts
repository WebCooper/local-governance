import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BlockchainService } from '../blockchain/blockchain.service';
import { AuthorityFundingService } from '../blockchain/authority-funding.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly fundingService: AuthorityFundingService,
  ) { }

  @Cron(process.env.BALANCE_SCAN_CRON_EXPRESSION || '0 1 * * *', {
    timeZone: 'Asia/Colombo',
  })
  async handleBalanceScan() {
    this.logger.log('CRON: Scanning authority and super admin balances...');
    try {
      const summary = await this.fundingService.scanAndFundAllAccounts();
      this.logger.log(
        `CRON Balance Scan completed. Funded: ${summary.funded.length}, Skipped: ${summary.skipped.length}, Errors: ${summary.errors.length}`,
      );
    } catch (error: any) {
      this.logger.error(`CRON Balance Scan failed: ${error.message}`);
    }
  }

  @Cron(process.env.CRON_EXPRESSION || CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    timeZone: "Asia/Colombo" //add time zone property. Now this will run according to sl time zone
  })
  async handleVotingWindowFinalizations() {
    this.logger.log('CRON: Scanning for expired voting windows...');

    try {
      // Fetch recent reports to check their status
      const recentReports = await this.blockchainService.getLatestReportsForCron(100);
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
        this.logger.log(`CRON: Found ${expiredReportIds.length} expired reports. Batch finalizing...`);
        await this.blockchainService.batchFinalizeOnChain(expiredReportIds);
      } else {
        this.logger.log('CRON: No expired reports found requiring finalization.');
      }
    } catch (error: any) {
      this.logger.error(`CRON Finalization failed: ${error.message}`);
    }
  }
}