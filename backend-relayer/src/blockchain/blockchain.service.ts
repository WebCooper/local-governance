import { Injectable, OnModuleInit, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

// Monorepo Magic: Import the ABI directly from your Hardhat artifacts!
import * as ReportingArtifact from './Reporting.json';

@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);
  private provider!: ethers.JsonRpcProvider;
  private relayerWallet!: ethers.Wallet;
  private reportingContract!: ethers.Contract;
  private blockchainEnabled = false;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.initializeWeb3();
  }

  private initializeWeb3() {
    const blockchainEnabled =
      (this.configService.get<string>('BLOCKCHAIN_SUBMISSION_ENABLED') ?? 'false').toLowerCase() === 'true';

    if (!blockchainEnabled) {
      this.blockchainEnabled = false;
      this.logger.warn(
        'Blockchain submission is disabled (BLOCKCHAIN_SUBMISSION_ENABLED is not true). Skipping Web3 initialization.',
      );
      return;
    }

    this.blockchainEnabled = true;

    // These values are pulled from your .env file
    const rpcUrl = this.configService.get<string>('RPC_URL'); 
    const privateKey = this.configService.get<string>('RELAYER_PRIVATE_KEY');
    const contractAddress = this.configService.get<string>('CONTRACT_ADDRESS');

    if (!rpcUrl || !privateKey || !contractAddress) {
      this.logger.error('Critical Web3 configuration missing from .env');
      return;
    }

    try {
      // 1. Connect to your Geth Node (Node 1)
      this.provider = new ethers.JsonRpcProvider(rpcUrl);

      // 2. Initialize the Relayer Wallet (which pays the zero-gas fees)
      this.relayerWallet = new ethers.Wallet(privateKey, this.provider);

      // 3. Instantiate the Smart Contract using the shared ABI
      this.reportingContract = new ethers.Contract(
        contractAddress,
        ReportingArtifact.abi,
        this.relayerWallet,
      );

      this.logger.log(`Blockchain connected. Relayer Address: ${this.relayerWallet.address}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize Web3: ${message}`);
    }
  }

  /**
   * Submits a validated report to the private blockchain.
   * This is called AFTER the Express ZKP server issues the nullifier 
   * and the AI Oracle approves the IPFS content.
   */
  async submitReportToChain(ipfsCID: string, reportHash: string, submissionNullifier: string, citizenPseudonym: string) {
    if (!this.blockchainEnabled) {
      this.logger.warn('submitReportToChain called while blockchain submission is disabled.');
      return {
        success: true,
        submissionStatus: 'skipped_blockchain_disabled',
        ipfsCID,
        submissionNullifier,
        citizenPseudonym
      };
    }

    try {

          // Convert hex strings to bytes32
    const reportHashBytes   = ethers.hexlify(ethers.getBytes(reportHash)) as `0x${string}`;
    const nullifierBytes = ethers.hexlify(ethers.getBytes(submissionNullifier)) as `0x${string}`;

      this.logger.log(`Initiating blockchain transaction for nullifier: ${submissionNullifier}`);
      
    const tx = await this.reportingContract.submitReport(   // ← was createReport
      ipfsCID,
      reportHashBytes,      // bytes32 reportHash
      nullifierBytes,       // bytes32 submissionNullifier
      citizenPseudonym      // bytes32 citizenPseudonym
    );
      
      this.logger.log(`Tx broadcasted: ${tx.hash}. Waiting for Geth network to mine...`);
      
      // Wait for the block to be sealed by the authority nodes
      const receipt = await tx.wait();
      
      this.logger.log(`Success! Report mined in block: ${receipt.blockNumber}`);
      
      return { 
        success: true, 
        transactionHash: tx.hash, 
        blockNumber: receipt.blockNumber 
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Blockchain submission failed: ${message}`);
      throw new InternalServerErrorException('Failed to record report on-chain.');
    }
  }

  // Add this inside BlockchainService class in src/blockchain/blockchain.service.ts

  async castVoteOnChain(reportId: number, phase: 'validation' | 'verification' | 'rejectionReview', nullifier: string, decision: boolean) {
    if (!this.blockchainEnabled) throw new InternalServerErrorException('Blockchain disabled');

    try {
      const nullifierBytes = ethers.hexlify(ethers.getBytes(nullifier)) as `0x${string}`;
      this.logger.log(`Casting ${phase} vote for report ${reportId}`);
      
      let tx;
      if (phase === 'validation') {
        tx = await this.reportingContract.castValidationVote(reportId, nullifierBytes, decision);
      } else if (phase === 'verification') {
        tx = await this.reportingContract.castVerificationVote(reportId, nullifierBytes, decision);
      } else if (phase === 'rejectionReview') {
        tx = await this.reportingContract.castRejectionReviewVote(reportId, nullifierBytes, decision);
      }

      const receipt = await tx.wait();
      return { success: true, transactionHash: tx.hash, blockNumber: receipt.blockNumber };
    } catch (error: any) {
      this.logger.error(`Vote submission failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to cast vote on-chain.');
    }
  }

  async batchFinalizeOnChain(reportIds: number[]) {
    if (!this.blockchainEnabled || reportIds.length === 0) return;
    try {
      this.logger.log(`Running batch finalization for ${reportIds.length} reports...`);
      const tx = await this.reportingContract.batchFinalizeVotingWindows(reportIds);
      await tx.wait();
      this.logger.log(`Batch finalization successful: ${tx.hash}`);
    } catch (error: any) {
      this.logger.error(`Batch finalization failed: ${error.message}`);
    }
  }

  // Helper method to read reports for the Cron Job
  async getLatestReportsForCron(limit: number = 50): Promise<any[]> {
    if (!this.blockchainEnabled) return [];
    // Assuming you have reportCount public variable or getAllReports implemented
    const [reports] = await this.reportingContract.getAllReports(0, limit); 
    return reports;
  }
}