import { Module } from '@nestjs/common';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { AiOracleService } from 'src/ai-oracle/ai-oracle.service';
import { IpfsService } from 'src/ipfs/ipfs.service';
import { CitizenAuthGuard } from './guards/citizen-auth.guard';
import { CronService } from './cron.service';

@Module({
  imports: [BlockchainModule],
  controllers: [ReportingController],
  providers: [ReportingService, AiOracleService, IpfsService, CitizenAuthGuard, CronService]
})
export class ReportingModule {}
