import { Module } from '@nestjs/common';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { AiOracleService } from 'src/ai-oracle/ai-oracle.service';
import { IpfsService } from 'src/ipfs/ipfs.service';
import { CitizenAuthGuard } from './guards/citizen-auth.guard';
import { CronService } from './cron.service';
import { ReportQueueService } from './queue/report-queue.service';
import { ReportStatusService } from './queue/report-status.service';
import { ModerationProcessorService } from './queue/moderation.processor';
import { IpfsUploadProcessorService } from './queue/ipfs-upload.processor';
import { ChainSubmitProcessorService } from './queue/chain-submit.processor';

@Module({
  imports: [BlockchainModule],
  controllers: [ReportingController],
  providers: [
    ReportingService,
    AiOracleService,
    IpfsService,
    CitizenAuthGuard,
    CronService,
    ReportQueueService,
    ReportStatusService,
    ModerationProcessorService,
    IpfsUploadProcessorService,
    ChainSubmitProcessorService,
  ],
})
export class ReportingModule {}
