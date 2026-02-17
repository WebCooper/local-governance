import { Module } from '@nestjs/common';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { ReportingController } from './reporting.controller';

@Module({
  imports: [BlockchainModule],
  controllers: [ReportingController],
})
export class ReportingModule {}
