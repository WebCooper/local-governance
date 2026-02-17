import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateReportDto } from './dto/create-report.dto';
import { BlockchainService } from '../blockchain/blockchain.service';
// import { IpfsService } from '../ipfs/ipfs.service';
// import { AiOracleService } from '../ai-oracle/ai-oracle.service';

@Controller('reporting')
export class ReportingController {
  private readonly logger = new Logger(ReportingController.name);

  constructor(
    private readonly blockchainService: BlockchainService,
    // private readonly ipfsService: IpfsService,
    // private readonly aiOracleService: AiOracleService,
  ) {}

  @Post('submit')
  @UseInterceptors(FileInterceptor('image')) // Expects a file field named "image"
  async submitReport(
    @Body() createReportDto: CreateReportDto,
    @UploadedFile() image: Express.Multer.File,
  ) {
    // STEP 0: Validation
    if (!image) {
      throw new BadRequestException('Visual evidence (image) is required');
    }

    // Check if mockProof is structurally valid (basic simulation check)
    if (!createReportDto.mockProof.startsWith('zkp_valid_proof_')) {
      throw new BadRequestException('Invalid citizen identity proof');
    }

    this.logger.log(
      `Received report submission request for nullifier: ${createReportDto.nullifierHash}`,
    );
    this.logger.log(`Image uploaded: ${image.filename} (${image.size} bytes)`);

    // STEP 1: Storage (IPFS)
    // Create a JSON object combining the text data and the image
    // const ipfsCID = await this.ipfsService.uploadEvidence(createReportDto, image.buffer);
    const ipfsCID = 'ipfs://QmMockHashForNow12345'; // Mocked until IPFS service is built
    this.logger.log(`IPFS upload mocked: ${ipfsCID}`);

    // STEP 2: AI Moderation
    // Send the text and image to your teammate's AI Oracle node
    // const aiVerdict = await this.aiOracleService.moderateContent(createReportDto.description, image.buffer);
    // if (!aiVerdict.isApproved) {
    //   throw new BadRequestException('Content rejected by AI moderation: ' + aiVerdict.reason);
    // }
    this.logger.log('AI moderation mocked: content approved');

    // STEP 3: Blockchain Submission
    // If IPFS and AI are successful, use the Relayer to submit to Geth
    const txResult = await this.blockchainService.submitReportToChain(
      ipfsCID,
      createReportDto.nullifierHash,
    );

    this.logger.log(`Report submitted successfully: ${txResult.transactionHash}`);

    return {
      message: 'Report successfully validated and recorded on the blockchain.',
      data: txResult,
    };
  }
}
