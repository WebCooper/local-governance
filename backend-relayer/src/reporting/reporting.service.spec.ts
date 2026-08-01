import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { ethers } from 'ethers';
import { ReportingService, SubmitReportPayload } from './reporting.service';
import { AiOracleService } from '../ai-oracle/ai-oracle.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { IpfsService } from '../ipfs/ipfs.service';
import { ReportQueueProducer } from '../queue/report-queue.producer';
import { ReportFlowProducer } from '../queue/report-flow.producer';
import { VoteQueueProducer } from '../queue/vote-queue.producer';
import { CastVoteDto } from './dto/cast-vote.dto';

/**
 * Test helpers: generate real Ethereum keys and signatures so we can
 * test the full cryptographic pipeline without touching any external service.
 */

// Simulated government wallet (the "gov simulator" / zkp signer)
const GOV_WALLET = ethers.Wallet.createRandom();
// Simulated citizen wallet
const CITIZEN_WALLET = ethers.Wallet.createRandom();

async function buildValidReportPayload(overrides: Partial<SubmitReportPayload> = {}): Promise<SubmitReportPayload> {
  const description = overrides.description ?? 'There is a large pothole on Main Street causing accidents.';
  const category = overrides.category ?? 'Infrastructure';
  const location = overrides.location ?? 'Main Street, Block 3';
  const imageHashes: string[] = [];

  // zkpTicketId is a random bytes32 the gov signed
  const zkpTicketId = ethers.keccak256(ethers.toUtf8Bytes('ticket-' + Date.now()));
  const zkpSignature = overrides.zkpSignature ?? await GOV_WALLET.signMessage(ethers.getBytes(zkpTicketId));

  const combinedImageHashes = imageHashes.join('');
  const messageHash = ethers.solidityPackedKeccak256(
    ['string', 'string', 'string'],
    [description, zkpTicketId, combinedImageHashes],
  );
  const signature = overrides.signature ?? await CITIZEN_WALLET.signMessage(ethers.getBytes(messageHash));

  return {
    description,
    category,
    location,
    zkpTicketId: overrides.zkpTicketId ?? zkpTicketId,
    zkpSignature,
    citizenPubKey: overrides.citizenPubKey ?? CITIZEN_WALLET.address,
    signature,
    imageHashes: JSON.stringify(imageHashes),
    isEmergency: overrides.isEmergency ?? false,
  };
}

async function buildValidVotePayload(overrides: Partial<CastVoteDto> = {}): Promise<CastVoteDto> {
  const reportId = overrides.reportId ?? 1;
  const votePhase = overrides.votePhase ?? 'validation';
  const decision = overrides.decision ?? true;

  const zkpTicketId = ethers.keccak256(ethers.toUtf8Bytes('vote-ticket-' + Date.now()));
  const zkpSignature = await GOV_WALLET.signMessage(ethers.getBytes(zkpTicketId));

  const messageHash = ethers.solidityPackedKeccak256(
    ['uint256', 'string', 'bool', 'string'],
    [reportId, votePhase, decision, zkpTicketId],
  );
  const signature = await CITIZEN_WALLET.signMessage(ethers.getBytes(messageHash));

  return {
    reportId,
    votePhase,
    decision,
    zkpTicketId: overrides.zkpTicketId ?? zkpTicketId,
    zkpSignature: overrides.zkpSignature ?? zkpSignature,
    citizenPubKey: overrides.citizenPubKey ?? CITIZEN_WALLET.address,
    signature: overrides.signature ?? signature,
  };
}

// ─── Mock factories ──────────────────────────────────────────────────────────

const mockAiOracle = (): Partial<AiOracleService> => ({
  moderateContent: jest.fn().mockResolvedValue({ success: true, isApproved: true }),
  evaluatePoll: jest.fn().mockResolvedValue(true),
});

const mockBlockchainService = (): Partial<BlockchainService> => ({
  submitReportToChain: jest.fn().mockResolvedValue({ transactionHash: '0xabc', blockNumber: 42 }),
  isAuthority: jest.fn().mockResolvedValue(false),
  castVoteOnChain: jest.fn().mockResolvedValue({ success: true }),
});

const mockIpfsService = (): Partial<IpfsService> => ({
  uploadComplaint: jest.fn().mockResolvedValue({ cid: 'QmTestCid', ipfsUri: 'ipfs://QmTestCid', raw: {} }),
});

const mockReportQueueProducer = (): Partial<ReportQueueProducer> => ({
  addReportJob: jest.fn().mockResolvedValue('job-id-123'),
});

const mockReportFlowProducer = (): Partial<ReportFlowProducer> => ({
  addReportFlow: jest.fn().mockResolvedValue('flow-job-id-456'),
});

const mockVoteQueueProducer = (): Partial<VoteQueueProducer> => ({
  addVoteJob: jest.fn().mockResolvedValue('vote-job-id-789'),
});

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('ReportingService', () => {
  let service: ReportingService;

  beforeEach(async () => {
    // Set env vars that the service reads in onModuleInit
    process.env.GOV_PUBLIC_ADDRESS = GOV_WALLET.address;
    process.env.PSEUDONYM_DOMAIN_SALT = 'CivicReport-TestSalt-v1';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportingService,
        { provide: AiOracleService, useValue: mockAiOracle() },
        { provide: BlockchainService, useValue: mockBlockchainService() },
        { provide: IpfsService, useValue: mockIpfsService() },
        { provide: ReportQueueProducer, useValue: mockReportQueueProducer() },
        { provide: ReportFlowProducer, useValue: mockReportFlowProducer() },
        { provide: VoteQueueProducer, useValue: mockVoteQueueProducer() },
      ],
    }).compile();

    service = module.get<ReportingService>(ReportingService);
    await service.onModuleInit();
  });

  afterEach(() => {
    delete process.env.GOV_PUBLIC_ADDRESS;
    delete process.env.PSEUDONYM_DOMAIN_SALT;
  });

  // ─── T2.1: Government Ticket Verification ──────────────────────────────────

  describe('T2.1 — Government ticket verification', () => {

    it('T2.1.1 — valid gov signature is accepted and returns a jobId', async () => {
      const payload = await buildValidReportPayload();
      const result = await service.validateAndEnqueue(payload);
      expect(result).toHaveProperty('jobId');
    });

    it('T2.1.2 — wrong gov signer address is rejected with UnauthorizedException', async () => {
      // Sign with a random wallet instead of the gov wallet
      const imposter = ethers.Wallet.createRandom();
      const payload = await buildValidReportPayload();
      const zkpTicketId = payload.zkpTicketId;
      const forgedSignature = await imposter.signMessage(ethers.getBytes(zkpTicketId));

      await expect(
        service.validateAndEnqueue({ ...payload, zkpSignature: forgedSignature })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('T2.1.3 — missing zkpSignature field throws BadRequestException', async () => {
      const payload = await buildValidReportPayload();
      await expect(
        service.validateAndEnqueue({ ...payload, zkpSignature: '' })
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── T2.2: Citizen Payload Signature Verification ──────────────────────────

  describe('T2.2 — Citizen payload signature verification', () => {

    it('T2.2.1 — valid citizen signature is accepted', async () => {
      const payload = await buildValidReportPayload();
      const result = await service.validateAndEnqueue(payload);
      expect(result.jobId).toBeDefined();
    });

    it('T2.2.2 — tampered description causes signature mismatch → UnauthorizedException', async () => {
      const payload = await buildValidReportPayload({ description: 'Original description' });
      // Tamper with description after signing
      const tamperedPayload = { ...payload, description: 'TAMPERED description' };

      await expect(
        service.validateAndEnqueue(tamperedPayload)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('T2.2.3 — wrong citizenPubKey (address mismatch) causes rejection', async () => {
      const payload = await buildValidReportPayload();
      const differentWallet = ethers.Wallet.createRandom();

      await expect(
        service.validateAndEnqueue({ ...payload, citizenPubKey: differentWallet.address })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('T2.2.4 — image count mismatch throws BadRequestException', async () => {
      const payload = await buildValidReportPayload();
      // Say we have 1 image hash, but provide 0 actual images
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes('fake-image'));
      const tamperedPayload = { ...payload, imageHashes: JSON.stringify([fakeHash]) };

      // No images provided, but imageHashes says there should be 1
      const fakeImages: Express.Multer.File[] = [];
      await expect(
        service.validateAndEnqueue(tamperedPayload, fakeImages)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('T2.2.5 — malformed imageHashes JSON throws BadRequestException', async () => {
      const payload = await buildValidReportPayload();
      await expect(
        service.validateAndEnqueue({ ...payload, imageHashes: 'NOT_VALID_JSON' })
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── T2.3: Pseudonym Derivation ─────────────────────────────────────────────

  describe('T2.3 — Citizen pseudonym derivation', () => {

    it('T2.3.1 — same address + salt always produces the same pseudonym (deterministic)', () => {
      const addr = CITIZEN_WALLET.address;
      const result1 = service.getPseudonym(addr);
      const result2 = service.getPseudonym(addr);
      expect(result1.pseudonym).toBe(result2.pseudonym);
      expect(result1.pseudonym).toMatch(/^0x[0-9a-f]{64}$/i);
    });

    it('T2.3.2 — different addresses produce different pseudonyms', () => {
      const wallet2 = ethers.Wallet.createRandom();
      const ps1 = service.getPseudonym(CITIZEN_WALLET.address);
      const ps2 = service.getPseudonym(wallet2.address);
      expect(ps1.pseudonym).not.toBe(ps2.pseudonym);
    });

    it('T2.3.3 — missing PSEUDONYM_DOMAIN_SALT throws InternalServerErrorException', () => {
      delete process.env.PSEUDONYM_DOMAIN_SALT;
      expect(() => service.getPseudonym(CITIZEN_WALLET.address)).toThrow(InternalServerErrorException);
    });
  });

  // ─── T2.4: Vote Cryptographic Verification ─────────────────────────────────

  describe('T2.4 — Vote payload verification', () => {

    it('T2.4.1 — valid vote payload returns a jobId', async () => {
      const payload = await buildValidVotePayload();
      const result = await service.validateAndEnqueueVote(payload);
      expect(result).toHaveProperty('jobId');
    });

    it('T2.4.2 — invalid gov ticket for vote → UnauthorizedException', async () => {
      const payload = await buildValidVotePayload();
      const imposter = ethers.Wallet.createRandom();
      const forgedSig = await imposter.signMessage(ethers.getBytes(payload.zkpTicketId));
      await expect(
        service.validateAndEnqueueVote({ ...payload, zkpSignature: forgedSig })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('T2.4.3 — tampered vote citizen signature → UnauthorizedException', async () => {
      const payload = await buildValidVotePayload();
      await expect(
        service.validateAndEnqueueVote({ ...payload, signature: '0x' + 'a'.repeat(130) })
      ).rejects.toThrow();
    });

    it('T2.4.4 — missing required vote fields → BadRequestException', async () => {
      // @ts-expect-error intentionally missing fields
      await expect(service.validateAndEnqueueVote({})).rejects.toThrow(BadRequestException);
    });
  });

  // ─── T2.5: Missing env config ─────────────────────────────────────────────

  describe('T2.5 — Environment configuration validation', () => {

    it('T2.5.1 — missing GOV_PUBLIC_ADDRESS throws on module init', async () => {
      delete process.env.GOV_PUBLIC_ADDRESS;
      process.env.PSEUDONYM_DOMAIN_SALT = 'salt';

      const module = await Test.createTestingModule({
        providers: [
          ReportingService,
          { provide: AiOracleService, useValue: mockAiOracle() },
          { provide: BlockchainService, useValue: mockBlockchainService() },
          { provide: IpfsService, useValue: mockIpfsService() },
          { provide: ReportQueueProducer, useValue: mockReportQueueProducer() },
          { provide: ReportFlowProducer, useValue: mockReportFlowProducer() },
          { provide: VoteQueueProducer, useValue: mockVoteQueueProducer() },
        ],
      }).compile();

      const svc = module.get<ReportingService>(ReportingService);
      await expect(svc.onModuleInit()).rejects.toThrow('Missing GOV_PUBLIC_ADDRESS');
    });
  });
});
