import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiOracleModule } from '../ai-oracle/ai-oracle.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { IpfsService } from '../ipfs/ipfs.service';
import { REPORT_QUEUE_NAME, REPORT_STEP_QUEUE_NAME } from './report-queue.producer';
import { ReportQueueProducer } from './report-queue.producer';
import { ReportFlowProducer } from './report-flow.producer';
import { ReportQueueProcessor, ReportStepQueueProcessor } from './report-queue.processor';
import { ReportStatusGateway } from './report-status.gateway';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: REPORT_QUEUE_NAME },
      { name: REPORT_STEP_QUEUE_NAME },
    ),
    AiOracleModule,
    BlockchainModule,
  ],
  controllers: [ReportStatusGateway],
  providers: [
    ReportQueueProducer,
    ReportFlowProducer,
    ReportQueueProcessor,
    ReportStepQueueProcessor,
    IpfsService,
  ],
  exports: [
    ReportQueueProducer,
    ReportFlowProducer,
    // Export the BullMQ queue token so other modules can inject it if needed
    BullModule,
  ],
})
export class ReportQueueModule {}
