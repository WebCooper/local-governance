import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { BullstudioModule } from '@bullstudio/nestjs';
import { createBullMqQueueAdapter } from '@bullstudio/bullmq-adapter';
import { Queue } from 'bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BlockchainModule } from './blockchain/blockchain.module';
import { ReportingModule } from './reporting/reporting.module';
import { ReportQueueModule } from './queue/report-queue.module';
import { PollingModule } from './polling/polling.module';
import { REPORT_QUEUE_NAME, REPORT_STEP_QUEUE_NAME } from './queue/report-queue.producer';

@Module({
  imports: [
    ConfigModule.forRoot(),
    // ── BullMQ: global Redis connection ──────────────────────────────────────
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    // ── EventEmitter: bridges worker progress events → SSE gateway ───────────
    EventEmitterModule.forRoot(),
    // ── Feature modules ───────────────────────────────────────────────────────
    BlockchainModule,
    ReportingModule,
    ReportQueueModule,
    PollingModule,
    ScheduleModule.forRoot(),
    // ── BullStudio: job monitoring dashboard at /ops/bullstudio ──────────────
    BullstudioModule.forRootAsync({
      imports: [ReportQueueModule],
      inject: [
        getQueueToken(REPORT_QUEUE_NAME),
        getQueueToken(REPORT_STEP_QUEUE_NAME),
      ],
      useFactory: (reportQueue: Queue, reportStepQueue: Queue) => ({
        mountPath: '/ops/bullstudio',
        queues: [
          createBullMqQueueAdapter(reportQueue, {
            key: 'report-processing',
            label: 'Report Processing',
          }),
          createBullMqQueueAdapter(reportStepQueue, {
            key: 'report-step-processing',
            label: 'Report Flow Steps',
          }),
        ],
        protection: {
          type: 'session',
          username: process.env.BULLSTUDIO_USERNAME ?? 'admin',
          password: process.env.BULLSTUDIO_PASSWORD!,
          sessionSecret: process.env.BULLSTUDIO_SESSION_SECRET!,
        },
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

