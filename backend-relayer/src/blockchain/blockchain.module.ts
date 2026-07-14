import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BlockchainService } from './blockchain.service';
import { AuthorityFundingService } from './authority-funding.service';
import { FundingController } from './funding.controller';

@Module({
  imports: [ConfigModule],
  controllers: [FundingController],
  providers: [BlockchainService, AuthorityFundingService],
  exports: [BlockchainService, AuthorityFundingService],
})
export class BlockchainModule {}
