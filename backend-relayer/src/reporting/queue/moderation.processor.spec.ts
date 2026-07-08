import { Test, TestingModule } from '@nestjs/testing';
import { ModerationProcessorService } from './moderation.processor';
import { ReportQueueService } from './report-queue.service';
import { ReportStatusService } from './report-status.service';
import { AiOracleService } from '../../ai-oracle/ai-oracle.service';
import { ModerationJobData } from './report-job.interface';

describe('ModerationProcessorService (Integration Test)', () => {
  let processorService: ModerationProcessorService;
  let reportQueueService: ReportQueueService;
  let reportStatusService: ReportStatusService;
  let aiOracleService: { moderateContent: jest.Mock };

  const buildJobData = (
    overrides: Partial<ModerationJobData> = {},
  ): ModerationJobData => ({
    reportId: '0xticketA',
    description: 'Broken street light',
    category: 'Infrastructure',
    location: '6.9271, 79.8612',
    zkpTicketId: '0xticketA',
    zkpSignature: '0xgovsig',
    citizenPubKey: '0xcitizen',
    signature: '0xcitizensig',
    messageHash: '0xmsghash',
    citizenPseudonym: '0xpseudo',
    images: [],
    ...overrides,
  });

  beforeEach(async () => {
    aiOracleService = { moderateContent: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModerationProcessorService,
        ReportQueueService,
        ReportStatusService,
        { provide: AiOracleService, useValue: aiOracleService },
      ],
    }).compile();

    processorService = module.get(ModerationProcessorService);
    reportQueueService = module.get(ReportQueueService);
    reportStatusService = module.get(ReportStatusService);

    processorService.onModuleInit();
  });

  afterEach(async () => {
    await processorService.onModuleDestroy();
    await reportQueueService.onModuleDestroy();
    await reportStatusService.onModuleDestroy();
  });

  it('forwards an approved report to the ipfs-upload queue', async () => {
    aiOracleService.moderateContent.mockResolvedValueOnce({
      success: true,
      isApproved: true,
    });

    const jobData = buildJobData({
      reportId: '0xaccept1',
      zkpTicketId: '0xaccept1',
    });
    await reportQueueService.enqueueModeration(jobData);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(aiOracleService.moderateContent).toHaveBeenCalledWith(
      jobData.description,
      [],
      jobData.zkpTicketId,
      jobData.signature,
      jobData.zkpSignature,
      jobData.messageHash,
    );

    const status = await reportStatusService.getStatus('0xaccept1');
    expect(status).not.toBeNull();
    expect(['moderating', 'confirmed']).toContain(status!.stage);
  });

  it('stops the pipeline without retrying when AI rejects a report', async () => {
    aiOracleService.moderateContent.mockResolvedValueOnce({
      success: true,
      isApproved: false,
      reason: 'spam',
    });

    const jobData = buildJobData({
      reportId: '0xreject1',
      zkpTicketId: '0xreject1',
    });
    await reportQueueService.enqueueModeration(jobData);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const status = await reportStatusService.getStatus('0xreject1');
    expect(status).not.toBeNull();
    expect(status!.stage).toBe('moderation_rejected');
    expect(status!.moderationReason).toBe('spam');
  });
});
