import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BlockchainService } from './blockchain.service';
import { AuthorityFundingService } from './authority-funding.service';

@Module({
  imports: [ConfigModule],
  providers: [BlockchainService, AuthorityFundingService],
  exports: [BlockchainService, AuthorityFundingService],
})
export class BlockchainModule {}
