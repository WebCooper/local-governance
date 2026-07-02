import { Module } from '@nestjs/common';
import { PollingController } from './polling.controller';
import { PollingService } from './polling.service';
import { IpfsService } from 'src/ipfs/ipfs.service';
import { CitizenAuthGuard } from './guards/citizen-auth.guard';
import { BlockchainModule } from 'src/blockchain/blockchain.module';


@Module({
  imports: [BlockchainModule],
  controllers: [PollingController],
  providers: [PollingService, IpfsService, CitizenAuthGuard],
})
export class PollingModule { }