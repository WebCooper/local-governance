import { Controller, Post, Logger, InternalServerErrorException } from '@nestjs/common';
import { AuthorityFundingService } from './authority-funding.service';

@Controller('funding')
export class FundingController {
  private readonly logger = new Logger(FundingController.name);

  constructor(private readonly fundingService: AuthorityFundingService) {}

  @Post('scan')
  async triggerScan() {
    this.logger.log('Manual wallet scan and fund triggered via API endpoint');
    try {
      const summary = await this.fundingService.scanAndFundAllAccounts();
      return {
        success: true,
        message: 'Wallet balance scan and funding completed.',
        data: summary,
      };
    } catch (error: any) {
      this.logger.error(`Manual wallet scan failed: ${error.message}`);
      throw new InternalServerErrorException(error.message || 'Failed to complete wallet balance scan.');
    }
  }
}
