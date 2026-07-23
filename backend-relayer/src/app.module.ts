import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BlockchainModule } from './blockchain/blockchain.module';
import { ReportingModule } from './reporting/reporting.module';
import { PollingModule } from './polling/polling.module';
import { ScheduleModule } from '@nestjs/schedule';
import { TaskManagerModule } from './task-manager/task-manager.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    BlockchainModule,
    ReportingModule,
    PollingModule,
    ScheduleModule.forRoot(),
    TaskManagerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

