import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
import { ethers } from 'ethers';
import { BlockchainService } from 'src/blockchain/blockchain.service';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ReportQueueService } from './queue/report-queue.service';
import { ReportStatusService } from './queue/report-status.service';
import { QueuedImage } from './queue/report-job.interface';

export interface SubmitReportPayload {
  description: string;
  category: string;
  location: string;
  zkpTicketId: string;
  zkpSignature: string;
  citizenPubKey: string;
  signature: string;
  imageHashes: string;
}

@Injectable()
export class ReportingService implements OnModuleInit {
  private readonly logger = new Logger(ReportingService.name);

  private govPublicKey: string = '';

  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly reportQueueService: ReportQueueService,
    private readonly reportStatusService: ReportStatusService,
  ) {}

  async onModuleInit() {
    this.loadGovPublicKeyFromEnv();
  }

  private loadGovPublicKeyFromEnv() {
    const govPublicAddress = process.env.GOV_PUBLIC_ADDRESS;

    if (!govPublicAddress) {
      const message = 'Missing GOV_PUBLIC_ADDRESS in environment configuration';
      this.logger.error(message);
      throw new Error(message);
    }

    this.govPublicKey = govPublicAddress;
    this.logger.log(
      `Loaded Government Public Address from .env: ${this.govPublicKey}`,
    );
  }

  /**
   * Verifies the report synchronously (fast, local, no network calls), then
   * hands the heavy work -- AI moderation, IPFS upload, blockchain
   * submission -- off to the queue pipeline and returns immediately.
   * Only content that has already passed crypto verification ever reaches
   * the network stages, so a flood of forged/garbage requests can't tie up
   * the moderation/IPFS/chain queues.
   */
  async createReport(
    payload: SubmitReportPayload,
    images?: Express.Multer.File[],
  ) {
    const {
      description,
      category,
      location,
      zkpTicketId,
      zkpSignature,
      citizenPubKey,
      signature,
      imageHashes,
    } = payload;

    if (
      !description ||
      !category ||
      !location ||
      !zkpTicketId ||
      !zkpSignature ||
      !citizenPubKey ||
      !signature
    ) {
      throw new BadRequestException('Missing required fields in payload');
    }

    // STEP 1: Verify Government Ticket
    const recoveredGovAddress = ethers.verifyMessage(
      ethers.getBytes(zkpTicketId),
      zkpSignature,
    );

    if (recoveredGovAddress.toLowerCase() !== this.govPublicKey.toLowerCase()) {
      this.logger.error(
        `Gov signature mismatch. Expected: ${this.govPublicKey}, Got: ${recoveredGovAddress}`,
      );
      throw new UnauthorizedException('Invalid or forged government ticket');
    }

    // STEP 2: Parse and Verify Image Hashes
    let parsedImageHashes: string[] = [];
    if (imageHashes) {
      try {
        parsedImageHashes = JSON.parse(imageHashes) as string[];
      } catch {
        throw new BadRequestException(
          'Invalid imageHashes format. Expected JSON array.',
        );
      }
    }

    if (images && images.length > 0) {
      if (images.length !== parsedImageHashes.length) {
        throw new BadRequestException(
          'Mismatch between uploaded images count and provided hashes.',
        );
      }

      for (let i = 0; i < images.length; i++) {
        const computedHash = ethers.keccak256(images[i].buffer);
        if (computedHash !== parsedImageHashes[i]) {
          this.logger.error(
            `Image hash mismatch at index ${i}. Possible tampering.`,
          );
          throw new UnauthorizedException(
            `Image at index ${i} tampered in transit or hash mismatch.`,
          );
        }
      }
    }

    // STEP 3: Verify Citizen Payload Signature
    const combinedImageHashes = parsedImageHashes.join('');
    const messageHash = ethers.solidityPackedKeccak256(
      ['string', 'string', 'string'],
      [description, zkpTicketId, combinedImageHashes],
    );

    const recoveredCitizenAddress = ethers.verifyMessage(
      ethers.getBytes(messageHash),
      signature,
    );
    const citizenPseudonym = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'string'],
        [citizenPubKey, process.env.PSEUDONYM_DOMAIN_SALT ?? ''],
      ),
    );

    if (recoveredCitizenAddress.toLowerCase() !== citizenPubKey.toLowerCase()) {
      this.logger.error(
        `Citizen signature mismatch. Data tampered in transit.`,
      );
      throw new UnauthorizedException(
        'Invalid citizen signature. Payload may be tampered.',
      );
    }

    this.logger.log(
      '✅ Cryptographic verification passed. Payload and images are secure.',
    );

    // STEP 4: Hand off to the pipeline (moderation -> IPFS -> chain)
    const queuedImages: QueuedImage[] = (images ?? []).map((img) => ({
      filename: img.originalname,
      mimetype: img.mimetype,
      data: img.buffer.toString('base64'),
      size: img.size,
    }));

    // zkpTicketId doubles as the report's nullifier and is unique per
    // submission, so it's also the stable id used to track status across
    // the three queues.
    const reportId = zkpTicketId;

    await this.reportStatusService.setStage(reportId, 'queued');
    const job = await this.reportQueueService.enqueueModeration({
      reportId,
      description,
      category,
      location,
      zkpTicketId,
      zkpSignature,
      citizenPubKey,
      signature,
      messageHash,
      citizenPseudonym,
      images: queuedImages,
    });

    return {
      success: true,
      submissionStatus: 'queued',
      reportId,
      moderationJobId: job.id,
      statusUrl: `/report/status/${reportId}`,
    };
  }

  getPseudonym(citizenAddress: string): { pseudonym: string } {
    const salt = process.env.PSEUDONYM_DOMAIN_SALT;

    if (!salt) {
      this.logger.error('PSEUDONYM_DOMAIN_SALT is not set in environment');
      throw new InternalServerErrorException(
        'Pseudonym derivation is not configured',
      );
    }

    const pseudonym = ethers.keccak256(
      ethers.solidityPacked(['address', 'string'], [citizenAddress, salt]),
    );

    this.logger.log(`Pseudonym derived for ${citizenAddress}: ${pseudonym}`);

    return { pseudonym };
  }

  /** Report status, tracked by reportId (== zkpTicketId or vote nullifier). */
  async getStatus(reportId: string) {
    return this.reportStatusService.getStatus(reportId);
  }

  /**
   * Verifies the vote synchronously, then queues the on-chain cast onto the
   * SAME chain-submit queue used by report submission and cron
   * finalization -- all three share one relayer wallet and must be
   * serialized against each other, not just against other votes.
   */
  async castVote(payload: CastVoteDto) {
    const {
      reportId,
      votePhase,
      decision,
      zkpTicketId,
      zkpSignature,
      citizenPubKey,
      signature,
    } = payload;

    // 1. Verify Government Ticket (Nullifier)
    const recoveredGovAddress = ethers.verifyMessage(
      ethers.getBytes(zkpTicketId),
      zkpSignature,
    );
    if (recoveredGovAddress.toLowerCase() !== this.govPublicKey.toLowerCase()) {
      throw new UnauthorizedException('Invalid government ticket for voting');
    }

    // 2. Verify Citizen Signature
    const messageHash = ethers.solidityPackedKeccak256(
      ['uint256', 'string', 'bool', 'string'],
      [reportId, votePhase, decision, zkpTicketId],
    );

    const recoveredCitizenAddress = ethers.verifyMessage(
      ethers.getBytes(messageHash),
      signature,
    );

    if (recoveredCitizenAddress.toLowerCase() !== citizenPubKey.toLowerCase()) {
      throw new UnauthorizedException(
        'Invalid citizen signature on vote payload.',
      );
    }

    this.logger.log(`Vote crypto-verification passed for report ${reportId}`);

    // 3. Queue the on-chain submission (zkpTicketId is the vote nullifier
    // and is unique per vote, so it also doubles as this vote's status id).
    const voteStatusId = zkpTicketId;
    await this.reportStatusService.setStage(voteStatusId, 'queued');
    const job = await this.reportQueueService.enqueueChainSubmit({
      kind: 'cast-vote',
      reportId: voteStatusId,
      onChainReportId: reportId,
      votePhase,
      zkpTicketId,
      decision,
    });

    return {
      success: true,
      message: 'Vote queued for on-chain submission.',
      voteJobId: job.id,
      statusUrl: `/report/status/${voteStatusId}`,
    };
  }
}
