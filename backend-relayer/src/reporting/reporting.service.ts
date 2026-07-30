import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  OnModuleInit,
  InternalServerErrorException
} from '@nestjs/common';
import { ethers } from 'ethers';
import { AiOracleService } from '../ai-oracle/ai-oracle.service';
import { BlockchainService } from 'src/blockchain/blockchain.service';
import { IpfsService } from '../ipfs/ipfs.service';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ReportQueueProducer } from '../queue/report-queue.producer';
import { ReportFlowProducer } from '../queue/report-flow.producer';
import { ReportJobData } from '../queue/report-queue.types';
import { VoteQueueProducer } from '../queue/vote-queue.producer';
export interface SubmitReportPayload {
  description: string;
  category: string;
  location: string;
  zkpTicketId: string;
  zkpSignature: string;
  citizenPubKey: string;
  signature: string;
  imageHashes?: string;
  isEmergency?: string | boolean;
}



@Injectable()
export class ReportingService implements OnModuleInit {
  private readonly logger = new Logger(ReportingService.name);

  private govPublicKey: string = '';

  constructor(
    private readonly aiOracleService: AiOracleService,
    private readonly blockchainService: BlockchainService,
    private readonly ipfsService: IpfsService,
    private readonly reportQueueProducer: ReportQueueProducer,
    private readonly reportFlowProducer: ReportFlowProducer,
    private readonly voteQueueProducer: VoteQueueProducer,
  ) { }

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
    this.logger.log(`Loaded Government Public Address from .env: ${this.govPublicKey}`);
  }

  // ── NEW: Fast path — crypto verification then enqueue ─────────────────────
  // Called by the controller. Returns immediately with a jobId so the
  // citizen gets a 202 response instead of waiting 60+ seconds.
  async validateAndEnqueue(
    payload: SubmitReportPayload,
    images?: Express.Multer.File[],
  ): Promise<{ jobId: string }> {
    const {
      description,
      category,
      location,
      zkpTicketId,
      zkpSignature,
      citizenPubKey,
      signature,
      imageHashes,
      isEmergency,
    } = payload;

    if (!description || !category || !location || !zkpTicketId || !zkpSignature || !citizenPubKey || !signature) {
      throw new BadRequestException('Missing required fields in payload');
    }

    // STEP 1: Verify Government Ticket
    const recoveredGovAddress = ethers.verifyMessage(ethers.getBytes(zkpTicketId), zkpSignature);
    if (recoveredGovAddress.toLowerCase() !== this.govPublicKey.toLowerCase()) {
      throw new UnauthorizedException('Invalid or forged government ticket');
    }

    // STEP 2: Parse & Verify Image Hashes
    let parsedImageHashes: string[] = [];
    if (imageHashes) {
      try {
        parsedImageHashes = JSON.parse(imageHashes);
      } catch {
        throw new BadRequestException('Invalid imageHashes format. Expected JSON array.');
      }
    }

    if (images?.length) {
      if (images.length !== parsedImageHashes.length) {
        throw new BadRequestException('Mismatch between uploaded images count and provided hashes.');
      }
      for (let i = 0; i < images.length; i++) {
        const computedHash = ethers.keccak256(images[i].buffer);
        if (computedHash !== parsedImageHashes[i]) {
          throw new UnauthorizedException(`Image at index ${i} tampered in transit or hash mismatch.`);
        }
      }
    }

    // STEP 3: Verify Citizen Payload Signature
    const combinedImageHashes = parsedImageHashes.join('');
    const messageHash = ethers.solidityPackedKeccak256(
      ['string', 'string', 'string'],
      [description, zkpTicketId, combinedImageHashes],
    );
    const recoveredCitizenAddress = ethers.verifyMessage(ethers.getBytes(messageHash), signature);
    if (recoveredCitizenAddress.toLowerCase() !== citizenPubKey.toLowerCase()) {
      throw new UnauthorizedException('Invalid citizen signature. Payload may be tampered.');
    }

    const citizenPseudonym = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'string'],
        [citizenPubKey, process.env.PSEUDONYM_DOMAIN_SALT],
      ),
    );

    this.logger.log('✅ Cryptographic verification passed. Enqueueing background job…');

    // Serialise Multer buffers → base64 so they survive the Redis round-trip
    const serializedImages = (images ?? []).map((img) => ({
      buffer: img.buffer.toString('base64'),
      originalname: img.originalname,
      mimetype: img.mimetype,
      size: img.size,
    }));

    const jobData: ReportJobData = {
      citizenPubKey,
      description,
      category,
      location,
      zkpTicketId,
      zkpSignature,
      signature,
      imageHashes: imageHashes || '[]',
      citizenPseudonym,
      messageHash,
      isEmergency: isEmergency === 'true' || isEmergency === true,
      images: serializedImages,
    };

    const jobId = await this.reportFlowProducer.addReportFlow(jobData);
    return { jobId };
  }

  // ── Thin proxy: called by the BullMQ worker to submit to blockchain ─────────
  async submitToChain(
    ipfsCID: string,
    messageHash: string,
    zkpTicketId: string,
    citizenPseudonym: string,
    isEmergency: boolean,
  ) {
    return this.blockchainService.submitReportToChain(
      ipfsCID,
      messageHash,
      zkpTicketId,
      citizenPseudonym,
      isEmergency,
    );
  }

  // ── DEPRECATED: synchronous pipeline kept for backward compatibility ────────
  /** @deprecated Use validateAndEnqueue() instead. */
  async createReport(payload: SubmitReportPayload, images?: Express.Multer.File[]) {
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

    try {
      // STEP 1: Verify Government Ticket
      const recoveredGovAddress = ethers.verifyMessage(
        ethers.getBytes(zkpTicketId),
        zkpSignature
      );

      if (recoveredGovAddress.toLowerCase() !== this.govPublicKey.toLowerCase()) {
        this.logger.error(`Gov signature mismatch. Expected: ${this.govPublicKey}, Got: ${recoveredGovAddress}`);
        throw new UnauthorizedException('Invalid or forged government ticket');
      }

      // STEP 2: Parse and Verify Image Hashes
      let parsedImageHashes: string[] = [];
      if (imageHashes) {
        try {
          parsedImageHashes = JSON.parse(imageHashes);
        } catch (e) {
          throw new BadRequestException('Invalid imageHashes format. Expected JSON array.');
        }
      }

      if (images && images.length > 0) {
        if (images.length !== parsedImageHashes.length) {
          throw new BadRequestException('Mismatch between uploaded images count and provided hashes.');
        }

        for (let i = 0; i < images.length; i++) {
          const computedHash = ethers.keccak256(images[i].buffer);
          if (computedHash !== parsedImageHashes[i]) {
            this.logger.error(`Image hash mismatch at index ${i}. Possible tampering.`);
            throw new UnauthorizedException(`Image at index ${i} tampered in transit or hash mismatch.`);
          }
        }
      }

      // STEP 3: Verify Citizen Payload Signature
      const combinedImageHashes = parsedImageHashes.join("");
      const messageHash = ethers.solidityPackedKeccak256(
        ['string', 'string', 'string'],
        [description, zkpTicketId, combinedImageHashes]
      );

      const recoveredCitizenAddress = ethers.verifyMessage(
        ethers.getBytes(messageHash),
        signature
      );
      const citizenPseudonym = ethers.keccak256(
        ethers.solidityPacked(
          ['address', 'string'],
          [citizenPubKey, process.env.PSEUDONYM_DOMAIN_SALT]   // e.g. "CivicReport-v1"
        )
      );

      if (recoveredCitizenAddress.toLowerCase() !== citizenPubKey.toLowerCase()) {
        this.logger.error(`Citizen signature mismatch. Data tampered in transit.`);
        throw new UnauthorizedException('Invalid citizen signature. Payload may be tampered.');
      }

      this.logger.log('✅ Cryptographic verification passed. Payload and images are secure.');

      // STEP 4: AI Moderation
      this.logger.log('Initiating AI moderation...');
      const aiVerdict = await this.aiOracleService.moderateContent(
        description,
        images,
        zkpTicketId,
        signature,
        zkpSignature,
        messageHash // We pass the solidityPacked message hash as the payload_hash
      );

      if (!aiVerdict.isApproved) {
        this.logger.warn(`Report rejected by AI. Reason: ${aiVerdict.reason}`);
        throw new BadRequestException(`Content rejected by AI moderation: ${aiVerdict.reason || 'Violates community guidelines'}`);
      }
      this.logger.log('✅ AI moderation passed: Content approved.');

      // Update image buffers with blurred versions in-place if returned
      if (images && aiVerdict.blurredMedia && aiVerdict.blurredMedia.length > 0) {
        this.logger.log('[Face Blurring] AI Oracle returned blurred media. Updating image buffers in-place...');
        for (const blurred of aiVerdict.blurredMedia) {
          const matchingImage = images.find(img => img.originalname === blurred.file_name);
          if (matchingImage) {
            matchingImage.buffer = Buffer.from(blurred.base64, 'base64');
            matchingImage.size = matchingImage.buffer.length;
            this.logger.log(`[Face Blurring] Replaced original image ${blurred.file_name} with blurred version (${matchingImage.size} bytes).`);
          }
        }
      }

      // STEP 5: Storage (IPFS)
      this.logger.log('Initiating IPFS storage pipeline...');
      const ipfsStoreResult = await this.ipfsService.uploadComplaint({
        description,
        category,
        location,
        images,
      });
      const ipfsCID = ipfsStoreResult.ipfsUri;
      this.logger.log(`✅ Complaint successfully stored on IPFS. CID: ${ipfsStoreResult.cid}`);

      // STEP 6: Blockchain Submission
      this.logger.log('Submitting report to blockchain...');
      const chainResult = await this.blockchainService.submitReportToChain(
        ipfsCID,
        messageHash,       // this is the solidityPackedKeccak256 hash — already a bytes32 hex string
        zkpTicketId,       // used as the submission nullifier
        citizenPseudonym,
        payload.isEmergency === 'true' || payload.isEmergency === true
      );

      return {
        success: true,
        submissionStatus: 'confirmed_onchain',
        zkpTicketId,
        ipfsCID,
        transactionHash: chainResult.transactionHash,
        blockNumber: chainResult.blockNumber,
      };

    } catch (error: any) {
      this.logger.error(`Submission pipeline failed: ${error.message}`);
      if (error.status) throw error;
      throw new BadRequestException('Cryptographic verification, AI moderation, or blockchain submission failed');
    }
  }

  getPseudonym(citizenAddress: string): { pseudonym: string } {
    const salt = process.env.PSEUDONYM_DOMAIN_SALT;

    if (!salt) {
      this.logger.error('PSEUDONYM_DOMAIN_SALT is not set in environment');
      throw new InternalServerErrorException('Pseudonym derivation is not configured');
    }

    const pseudonym = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'string'],
        [citizenAddress, salt],
      ),
    );

    this.logger.log(`Pseudonym derived for ${citizenAddress}: ${pseudonym}`);

    return { pseudonym };
  }



  async validateAndEnqueueVote(payload: CastVoteDto): Promise<{ jobId: string }> {
    const { reportId, votePhase, decision, zkpTicketId, zkpSignature, citizenPubKey, signature } = payload;

    if (reportId === undefined || !votePhase || decision === undefined || !zkpTicketId || !zkpSignature || !citizenPubKey || !signature) {
      throw new BadRequestException('Missing required fields in vote payload');
    }

    try {
      // 1. Verify Government Ticket (Nullifier)
      const recoveredGovAddress = ethers.verifyMessage(ethers.getBytes(zkpTicketId), zkpSignature);
      if (recoveredGovAddress.toLowerCase() !== this.govPublicKey.toLowerCase()) {
        throw new UnauthorizedException('Invalid government ticket for voting');
      }

      // 2. Verify Citizen Signature
      // Reconstruct the message the citizen signed on the frontend
      const messageHash = ethers.solidityPackedKeccak256(
        ['uint256', 'string', 'bool', 'string'],
        [reportId, votePhase, decision, zkpTicketId]
      );

      const recoveredCitizenAddress = ethers.verifyMessage(ethers.getBytes(messageHash), signature);
      
      if (recoveredCitizenAddress.toLowerCase() !== citizenPubKey.toLowerCase()) {
        throw new UnauthorizedException('Invalid citizen signature on vote payload.');
      }

      this.logger.log(`✅ Vote crypto-verification passed for report ${reportId}. Enqueueing background job…`);

      // Derive citizen pseudonym to enforce one-vote-per-citizen restrictions
      const { pseudonym } = this.getPseudonym(recoveredCitizenAddress);

      const jobId = await this.voteQueueProducer.addVoteJob({
        reportId: String(reportId),
        votePhase,
        decision,
        zkpTicketId,
        zkpSignature,
        citizenPubKey,
        signature,
        pseudonym,
      });

      return { jobId };
    } catch (error: any) {
      this.logger.error(`Vote verification failed: ${error.message}`);
      if (error.status) throw error;
      throw new BadRequestException('Vote verification failed');
    }
  }
}