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
import { VOTE_QUEUE_NAME, VoteQueueProducer } from './vote-queue.producer';
import { VoteQueueProcessor } from './vote-queue.processor';
import { VoteStatusGateway } from './vote-status.gateway';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: REPORT_QUEUE_NAME },
      { name: REPORT_STEP_QUEUE_NAME },
      { name: VOTE_QUEUE_NAME },
    ),
    AiOracleModule,
    BlockchainModule,
  ],
  controllers: [ReportStatusGateway, VoteStatusGateway],
  providers: [
    ReportQueueProducer,
    ReportFlowProducer,
    ReportQueueProcessor,
    ReportStepQueueProcessor,
    IpfsService,
    VoteQueueProducer,
    VoteQueueProcessor,
  ],
  exports: [
    ReportQueueProducer,
    ReportFlowProducer,
    VoteQueueProducer,
    // Export the BullMQ queue token so other modules can inject it if needed
    BullModule,
  ],
})
export class ReportQueueModule {}
