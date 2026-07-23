import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TaskManagerService } from './task-manager.service';
import { TaskDbService } from './task-db.service';
import { TaskManagerController } from './task-manager.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [ConfigModule, BlockchainModule],
  controllers: [TaskManagerController],
  providers: [TaskManagerService, TaskDbService],
  exports: [TaskManagerService, TaskDbService],
})
export class TaskManagerModule {}

