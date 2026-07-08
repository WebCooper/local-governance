import { Test, TestingModule } from '@nestjs/testing';
import { ReportQueueService } from './report-queue.service';
import { ModerationJobData } from './report-job.interface';

describe('ReportQueueService', () => {
  let service: ReportQueueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportQueueService],
    }).compile();

    service = module.get<ReportQueueService>(ReportQueueService);
  });

  afterEach(async () => {
    await Promise.all([
      service.moderationQueue.drain(true),
      service.ipfsUploadQueue.drain(true),
      service.chainSubmitQueue.drain(true),
    ]);
    await service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('enqueues a report onto the moderation queue', async () => {
    const jobData: ModerationJobData = {
      reportId: '0xticket1',
      description: 'Pothole on Main St',
      category: 'Road Damage',
      location: '6.9271, 79.8612',
      zkpTicketId: '0xticket1',
      zkpSignature: '0xgovsig',
      citizenPubKey: '0xcitizen',
      signature: '0xcitizensig',
      messageHash: '0xmsghash',
      citizenPseudonym: '0xpseudo',
      images: [],
    };

    const job = await service.enqueueModeration(jobData);

    expect(job).toBeDefined();
    expect(job.data.reportId).toBe('0xticket1');
    expect(job.opts.attempts).toBe(3);
  });

  it('enqueues a submit-report job onto the shared chain-submit queue', async () => {
    const job = await service.enqueueChainSubmit({
      kind: 'submit-report',
      reportId: '0xticket2',
      ipfsCID: 'ipfs://QmMock',
      messageHash: '0xmsghash',
      zkpTicketId: '0xticket2',
      citizenPseudonym: '0xpseudo',
    });

    expect(job.name).toBe('submit-report');
    expect(job.data.kind).toBe('submit-report');
  });

  it('enqueues a cast-vote job onto the SAME chain-submit queue as report submission', async () => {
    const job = await service.enqueueChainSubmit({
      kind: 'cast-vote',
      reportId: '0xvotenullifier',
      onChainReportId: 7,
      votePhase: 'validation',
      zkpTicketId: '0xvotenullifier',
      decision: true,
    });

    expect(job.queueName).toBe(service.chainSubmitQueue.name);
    expect(job.data.kind).toBe('cast-vote');
  });

  it('enqueues a batch-finalize job onto the SAME chain-submit queue', async () => {
    const job = await service.enqueueChainSubmit({
      kind: 'batch-finalize',
      reportIds: [1, 2, 3],
    });

    expect(job.queueName).toBe(service.chainSubmitQueue.name);
    expect(job.data.kind).toBe('batch-finalize');
  });
});
