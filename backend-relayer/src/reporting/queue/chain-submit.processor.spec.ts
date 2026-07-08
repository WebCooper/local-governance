import { Test, TestingModule } from '@nestjs/testing';
import { ChainSubmitProcessorService } from './chain-submit.processor';
import { ReportStatusService } from './report-status.service';
import { ReportQueueService } from './report-queue.service';
import { BlockchainService } from '../../blockchain/blockchain.service';

describe('ChainSubmitProcessorService (Integration Test)', () => {
  let processorService: ChainSubmitProcessorService;
  let reportQueueService: ReportQueueService;
  let reportStatusService: ReportStatusService;
  let blockchainService: {
    submitReportToChain: jest.Mock;
    castVoteOnChain: jest.Mock;
    batchFinalizeOnChain: jest.Mock;
  };

  beforeEach(async () => {
    blockchainService = {
      submitReportToChain: jest.fn().mockResolvedValue({
        success: true,
        transactionHash: '0xreporttx',
        blockNumber: 10,
      }),
      castVoteOnChain: jest.fn().mockResolvedValue({
        success: true,
        transactionHash: '0xvotetx',
        blockNumber: 11,
      }),
      batchFinalizeOnChain: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChainSubmitProcessorService,
        ReportQueueService,
        ReportStatusService,
        { provide: BlockchainService, useValue: blockchainService },
      ],
    }).compile();

    processorService = module.get(ChainSubmitProcessorService);
    reportQueueService = module.get(ReportQueueService);
    reportStatusService = module.get(ReportStatusService);
  });

  afterEach(async () => {
    await processorService.onModuleDestroy();
    await reportQueueService.onModuleDestroy();
    await reportStatusService.onModuleDestroy();
    delete process.env.CHAIN_QUEUE_CONCURRENCY;
  });

  it('always runs at concurrency 1 even if CHAIN_QUEUE_CONCURRENCY is overridden', () => {
    process.env.CHAIN_QUEUE_CONCURRENCY = '10';
    processorService.onModuleInit();
    expect(processorService['worker'].opts.concurrency).toBe(1);
  });

  it('submits a report and records a confirmed status', async () => {
    processorService.onModuleInit();

    await reportQueueService.enqueueChainSubmit({
      kind: 'submit-report',
      reportId: '0xreportid1',
      ipfsCID: 'ipfs://QmMock',
      messageHash: '0xmsghash',
      zkpTicketId: '0xreportid1',
      citizenPseudonym: '0xpseudo',
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(blockchainService.submitReportToChain).toHaveBeenCalledWith(
      'ipfs://QmMock',
      '0xmsghash',
      '0xreportid1',
      '0xpseudo',
    );

    const status = await reportStatusService.getStatus('0xreportid1');
    expect(status).not.toBeNull();
    expect(status!.stage).toBe('confirmed');
    expect(status!.txHash).toBe('0xreporttx');
  });

  it('casts a vote using the same queue/worker as report submission', async () => {
    processorService.onModuleInit();

    await reportQueueService.enqueueChainSubmit({
      kind: 'cast-vote',
      reportId: '0xvoteid1',
      onChainReportId: 5,
      votePhase: 'verification',
      zkpTicketId: '0xvoteid1',
      decision: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(blockchainService.castVoteOnChain).toHaveBeenCalledWith(
      5,
      'verification',
      '0xvoteid1',
      true,
    );

    const status = await reportStatusService.getStatus('0xvoteid1');
    expect(status).not.toBeNull();
    expect(status!.stage).toBe('confirmed');
    expect(status!.txHash).toBe('0xvotetx');
  });

  it('runs cron batch-finalization through the same worker', async () => {
    processorService.onModuleInit();

    await reportQueueService.enqueueChainSubmit({
      kind: 'batch-finalize',
      reportIds: [1, 2, 3],
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(blockchainService.batchFinalizeOnChain).toHaveBeenCalledWith([
      1, 2, 3,
    ]);
  });
});
