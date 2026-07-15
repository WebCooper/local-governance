import { Module } from '@nestjs/common';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { AiOracleService } from 'src/ai-oracle/ai-oracle.service';
import { IpfsService } from 'src/ipfs/ipfs.service';
import { CitizenAuthGuard } from './guards/citizen-auth.guard';
import { AiOracleModule } from 'src/ai-oracle/ai-oracle.module';
import { CronService } from './cron.service';

@Module({
  imports: [BlockchainModule, AiOracleModule],
  controllers: [ReportingController],
  providers: [ReportingService, IpfsService, CitizenAuthGuard, CronService]
})
export class ReportingModule {}
