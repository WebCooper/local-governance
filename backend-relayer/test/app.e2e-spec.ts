/**
 * T7 Suite A — Fast E2E Integration Tests (Mocked External Services)
 *
 * Tests the full NestJS request pipeline with:
 *   - Real Ethers.js cryptographic signing (no mocking of crypto)
 *   - Mocked AI oracle (instant ACCEPT)
 *   - Mocked IPFS service (returns fake CID)
 *   - Mocked blockchain service (returns fake tx hash)
 *
 * This lets us test the entire HTTP layer, middleware, guards, and
 * service logic without any network dependencies.
 *
 * Run: npm run test:e2e
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ethers } from 'ethers';
import { AppModule } from '../src/app.module';
import { AiOracleService } from '../src/ai-oracle/ai-oracle.service';
import { IpfsService } from '../src/ipfs/ipfs.service';
import { BlockchainService } from '../src/blockchain/blockchain.service';
import { ReportFlowProducer } from '../src/queue/report-flow.producer';
import { VoteQueueProducer } from '../src/queue/vote-queue.producer';

// ─── Test wallets ──────────────────────────────────────────────────────────

const GOV_WALLET = ethers.Wallet.createRandom();
const CITIZEN_WALLET = ethers.Wallet.createRandom();

// ─── Crypto helpers ────────────────────────────────────────────────────────

async function buildReportPayload(opts: { isEmergency?: boolean } = {}) {
  const description = 'Pothole on Main Street requires urgent repair.';
  const category = 'Infrastructure';
  const location = 'Main Street, Block 5';

  const zkpTicketId = ethers.keccak256(ethers.toUtf8Bytes('e2e-ticket-' + Date.now()));
  const zkpSignature = await GOV_WALLET.signMessage(ethers.getBytes(zkpTicketId));

  const messageHash = ethers.solidityPackedKeccak256(
    ['string', 'string', 'string'],
    [description, zkpTicketId, ''],
  );
  const signature = await CITIZEN_WALLET.signMessage(ethers.getBytes(messageHash));

  return {
    description,
    category,
    location,
    zkpTicketId,
    zkpSignature,
    citizenPubKey: CITIZEN_WALLET.address,
    signature,
    imageHashes: '[]',
    isEmergency: opts.isEmergency ? 'true' : 'false',
  };
}

async function buildVotePayload(reportId: number, votePhase: string, decision: boolean) {
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
    zkpTicketId,
    zkpSignature,
    citizenPubKey: CITIZEN_WALLET.address,
    signature,
  };
}

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('T7 Suite A — E2E Integration (Mocked Services)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Set required env vars
    process.env.GOV_PUBLIC_ADDRESS = GOV_WALLET.address;
    process.env.PSEUDONYM_DOMAIN_SALT = 'E2ETestSalt-v1';
    process.env.BLOCKCHAIN_SUBMISSION_ENABLED = 'false'; // use mock

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AiOracleService)
      .useValue({
        moderateContent: jest.fn().mockResolvedValue({ success: true, isApproved: true }),
        evaluatePoll: jest.fn().mockResolvedValue(true),
      })
      .overrideProvider(IpfsService)
      .useValue({
        uploadComplaint: jest.fn().mockResolvedValue({
          cid: 'QmMockedCid123',
          ipfsUri: 'ipfs://QmMockedCid123',
          raw: {},
        }),
        uploadPoll: jest.fn().mockResolvedValue({
          cid: 'QmMockedPollCid456',
          ipfsUri: 'ipfs://QmMockedPollCid456',
          raw: {},
        }),
      })
      .overrideProvider(BlockchainService)
      .useValue({
        submitReportToChain: jest.fn().mockResolvedValue({
          success: true,
          transactionHash: '0xmockedTxHash',
          blockNumber: 42,
        }),
        isAuthority: jest.fn().mockResolvedValue(false),
        castVoteOnChain: jest.fn().mockResolvedValue({ success: true }),
        createPollOnChain: jest.fn().mockResolvedValue({
          success: true,
          transactionHash: '0xmockedPollTx',
          blockNumber: 43,
        }),
      })
      .overrideProvider(ReportFlowProducer)
      .useValue({
        addReportFlow: jest.fn().mockResolvedValue('mocked-flow-job-id'),
      })
      .overrideProvider(VoteQueueProducer)
      .useValue({
        addVoteJob: jest.fn().mockResolvedValue('mocked-vote-job-id'),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.GOV_PUBLIC_ADDRESS;
    delete process.env.PSEUDONYM_DOMAIN_SALT;
    delete process.env.BLOCKCHAIN_SUBMISSION_ENABLED;
  });

  // ─── T7.1.1 — Report submission ──────────────────────────────────────────

  describe('POST /report — Report Submission', () => {

    it('T7.1.1 — Valid report submission returns 202 with jobId', async () => {
      const payload = await buildReportPayload();

      const response = await request(app.getHttpServer())
        .post('/report')
        .field('description', payload.description)
        .field('category', payload.category)
        .field('location', payload.location)
        .field('zkpTicketId', payload.zkpTicketId)
        .field('zkpSignature', payload.zkpSignature)
        .field('citizenPubKey', payload.citizenPubKey)
        .field('signature', payload.signature)
        .field('imageHashes', payload.imageHashes)
        .field('isEmergency', payload.isEmergency);

      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('jobId');
      expect(response.body.status).toBe('pending');
      expect(response.body.success).toBe(true);
    });

    it('T7.1.2 — Missing required fields returns 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/report')
        .field('description', 'Incomplete payload')
        .field('category', 'Infrastructure');

      expect(response.status).toBe(400);
    });

    it('T7.1.3 — Invalid government signature returns 401', async () => {
      const payload = await buildReportPayload();
      const imposter = ethers.Wallet.createRandom();
      const forgedSig = await imposter.signMessage(ethers.getBytes(payload.zkpTicketId));

      const response = await request(app.getHttpServer())
        .post('/report')
        .field('description', payload.description)
        .field('category', payload.category)
        .field('location', payload.location)
        .field('zkpTicketId', payload.zkpTicketId)
        .field('zkpSignature', forgedSig)  // <-- forged
        .field('citizenPubKey', payload.citizenPubKey)
        .field('signature', payload.signature)
        .field('imageHashes', '[]');

      expect(response.status).toBe(401);
    });

    it('T7.1.4 — Tampered description invalidates citizen signature → 401', async () => {
      const payload = await buildReportPayload();

      const response = await request(app.getHttpServer())
        .post('/report')
        .field('description', 'TAMPERED DESCRIPTION')  // <-- tampered
        .field('category', payload.category)
        .field('location', payload.location)
        .field('zkpTicketId', payload.zkpTicketId)
        .field('zkpSignature', payload.zkpSignature)
        .field('citizenPubKey', payload.citizenPubKey)
        .field('signature', payload.signature)  // still original sig
        .field('imageHashes', '[]');

      expect(response.status).toBe(401);
    });

    it('T7.1.5 — Emergency report submission returns 202', async () => {
      const payload = await buildReportPayload({ isEmergency: true });

      const response = await request(app.getHttpServer())
        .post('/report')
        .field('description', payload.description)
        .field('category', payload.category)
        .field('location', payload.location)
        .field('zkpTicketId', payload.zkpTicketId)
        .field('zkpSignature', payload.zkpSignature)
        .field('citizenPubKey', payload.citizenPubKey)
        .field('signature', payload.signature)
        .field('imageHashes', '[]')
        .field('isEmergency', 'true');

      expect(response.status).toBe(202);
      expect(response.body.jobId).toBeDefined();
    });
  });

  // ─── T7.1 — Vote submission ───────────────────────────────────────────────

  describe('POST /report/vote — Vote Submission', () => {

    it('T7.3.1 — Valid vote payload returns 202 with jobId', async () => {
      const payload = await buildVotePayload(1, 'validation', true);

      const response = await request(app.getHttpServer())
        .post('/report/vote')
        .send(payload);

      expect(response.status).toBe(202);
      expect(response.body.jobId).toBeDefined();
      expect(response.body.success).toBe(true);
    });

    it('T7.3.2 — Invalid gov ticket for vote returns 401', async () => {
      const payload = await buildVotePayload(1, 'validation', true);
      const imposter = ethers.Wallet.createRandom();
      const forgedSig = await imposter.signMessage(ethers.getBytes(payload.zkpTicketId));

      const response = await request(app.getHttpServer())
        .post('/report/vote')
        .send({ ...payload, zkpSignature: forgedSig });

      expect(response.status).toBe(401);
    });

    it('T7.3.3 — Missing vote fields returns 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/report/vote')
        .send({ reportId: 1 }); // missing everything else

      expect(response.status).toBe(400);
    });
  });

  // ─── T7 — Pseudonym endpoint ──────────────────────────────────────────────

  describe('GET /report/my-pseudonym — Citizen Auth Guard', () => {

    it('T7.4.1 — Missing gov signature header returns 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/report/my-pseudonym');

      // Without proper auth headers, should be unauthorized
      expect([401, 403]).toContain(response.status);
    });
  });
});
