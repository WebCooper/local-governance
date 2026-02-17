import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BlockchainModule } from './blockchain/blockchain.module';
import { ReportingModule } from './reporting/reporting.module';

@Module({
  imports: [ConfigModule.forRoot(), BlockchainModule, ReportingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
