import { Injectable, OnModuleInit, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

// Monorepo Magic: Import the ABI directly from your Hardhat artifacts!
import * as ReportingArtifact from './Reporting.json';
import * as OpinionPollingArtifact from './OpinionPolling.json';
import * as EmergencyReportingArtifact from './EmergencyReporting.json';

@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);
  private provider!: ethers.JsonRpcProvider;
  private relayerWallet!: ethers.Wallet;
  private reportingContract!: ethers.Contract;
  private pollingContract!: ethers.Contract;
  private emergencyReportingContract!: ethers.Contract;
  private blockchainEnabled = false;

  constructor(private configService: ConfigService) { }

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
    const contractAddress = this.configService.get<string>('REPORTING_CONTRACT_ADDRESS');
    const pollingAddress = this.configService.get<string>('POLLING_CONTRACT_ADDRESS');

    if (!rpcUrl || !privateKey || !contractAddress || !pollingAddress) {
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

      // INITIALIZE POLLING CONTRACT
      this.pollingContract = new ethers.Contract(
        pollingAddress,
        OpinionPollingArtifact.abi,
        this.relayerWallet
      );

      const emergencyAddress =
        this.configService.get<string>('EMERGENCY_REPORTING_CONTRACT_ADDRESS') ||
        this.configService.get<string>('EMERGANCY_REPORT_CONTRACT_ADDRESS') ||
        this.configService.get<string>('EMERGENCY_REPORT_CONTRACT_ADDRESS') ||
        '0x43491d6850cef4B2E2D0d5CaCdF59B014B4A49ba';
      this.emergencyReportingContract = new ethers.Contract(
        emergencyAddress,
        EmergencyReportingArtifact.abi,
        this.relayerWallet
      );

      this.logger.log(`Blockchain connected. Relayer Address: ${this.relayerWallet.address}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize Web3: ${message}`);
    }
  }

  getReportingContract(): ethers.Contract | null {
    return this.reportingContract || null;
  }

  getEmergencyReportingContract(): ethers.Contract | null {
    return this.emergencyReportingContract || null;
  }


  /**
   * Submits a validated report to the private blockchain.
   * This is called AFTER the Express ZKP server issues the nullifier 
   * and the AI Oracle approves the IPFS content.
   */
  async submitReportToChain(ipfsCID: string, reportHash: string, submissionNullifier: string, citizenPseudonym: string, isEmergency: boolean) {
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
      const reportHashBytes = ethers.hexlify(ethers.getBytes(reportHash)) as `0x${string}`;
      const nullifierBytes = ethers.hexlify(ethers.getBytes(submissionNullifier)) as `0x${string}`;

      this.logger.log(`Initiating blockchain transaction for nullifier: ${submissionNullifier} (Emergency: ${isEmergency})`);

      let tx;
      if (isEmergency && this.emergencyReportingContract) {
        tx = await this.emergencyReportingContract.submitEmergencyReport(
          ipfsCID,
          reportHashBytes,      // bytes32 reportHash
          nullifierBytes,       // bytes32 submissionNullifier
          citizenPseudonym      // bytes32 citizenPseudonym
        );
      } else {
        tx = await this.reportingContract.submitReport(
          ipfsCID,
          reportHashBytes,      // bytes32 reportHash
          nullifierBytes,       // bytes32 submissionNullifier
          citizenPseudonym      // bytes32 citizenPseudonym
        );
      }

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

  async downgradeEmergencyOnChain(reportId: number, comment = "Not an emergency") {
    if (!this.blockchainEnabled) {
      this.logger.warn('downgradeEmergencyOnChain called while blockchain submission is disabled.');
      return { success: true };
    }

    try {
      this.logger.log(`Initiating blockchain transaction to downgrade emergency for report: ${reportId}`);
      const tx = await this.emergencyReportingContract.reclassifyEmergency(reportId, comment);
      this.logger.log(`Tx broadcasted: ${tx.hash}. Waiting for Geth network to mine...`);
      const receipt = await tx.wait();
      this.logger.log(`Success! Emergency downgraded in block: ${receipt.blockNumber}`);
      return {
        success: true,
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Blockchain submission failed: ${message}`);
      throw new InternalServerErrorException('Failed to downgrade emergency on-chain.');
    }
  }

  // Add this inside BlockchainService class in src/blockchain/blockchain.service.ts

  async castVoteOnChain(
    reportId: number,
    phase: 'validation' | 'verification' | 'rejectionReview',
    nullifier: string,
    decision: boolean,
    citizenPseudonym: string,
  ) {
    if (!this.blockchainEnabled) throw new InternalServerErrorException('Blockchain disabled');

    try {
      const nullifierBytes = ethers.hexlify(ethers.getBytes(nullifier)) as `0x${string}`;
      const pseudonymBytes = ethers.hexlify(ethers.getBytes(citizenPseudonym)) as `0x${string}`;
      this.logger.log(`Casting ${phase} vote for report ${reportId} with pseudonym ${citizenPseudonym}`);

      let tx;
      if (phase === 'validation') {
        tx = await this.reportingContract.castValidationVote(reportId, nullifierBytes, decision, pseudonymBytes);
      } else if (phase === 'verification') {
        tx = await this.reportingContract.castVerificationVote(reportId, nullifierBytes, decision, pseudonymBytes);
      } else if (phase === 'rejectionReview') {
        tx = await this.reportingContract.castRejectionReviewVote(reportId, nullifierBytes, decision, pseudonymBytes);
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

  /**
 * Triggers the OpinionPolling contract for government authorities.
 */
  async createPollOnChain(ipfsCID: string, deadline: number, pollType: number) {
    if (!this.blockchainEnabled) throw new InternalServerErrorException('Blockchain disabled');

    try {
      this.logger.log(`Broadcasting createOfficialPoll for CID: ${ipfsCID}`);

      // Calling the smart contract function defined in OpinionPolling.sol
      const tx = await this.pollingContract.createOfficialPoll(
        ipfsCID,
        deadline,
        pollType
      );

      const receipt = await tx.wait();
      this.logger.log(`✅ Poll created on-chain in block: ${receipt.blockNumber}`);

      return {
        success: true,
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber
      };
    } catch (error: any) {
      this.logger.error(`Poll creation on-chain failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to record poll on-chain.');
    }
  }

  async castPollVoteOnChain(pollId: number, optionIndex: number, nullifier: string) {
    if (!this.blockchainEnabled) throw new InternalServerErrorException('Blockchain cluster offline');

    try {
      // Convert hex string nullifier to bytes32 format, tracking the exact pattern used in submitReportToChain
      const nullifierBytes = ethers.hexlify(ethers.getBytes(nullifier)) as `0x${string}`;

      this.logger.log(`Broadcasting castVote transaction for poll: ${pollId}`);
      const tx = await this.pollingContract.castVote(pollId, optionIndex, nullifierBytes);

      const receipt = await tx.wait();
      this.logger.log(`✅ Vote successfully cataloged in block ${receipt.blockNumber}`);
      return { success: true, transactionHash: tx.hash };
    } catch (error: any) {
      this.logger.error(`On-chain vote broadcast failure: ${error.message}`);

      const errStr = error.message || '';
      const errData = error.data || '';

      if (errStr.includes('AlreadyVotedWithNullifier') || errData.includes('0xc73a9589')) {
        throw new BadRequestException('You have already cast your ballot for this poll.');
      }
      if (errStr.includes('PollInactiveOrClosed') || errData.includes('0x78045ee6')) {
        throw new BadRequestException('This poll has closed or is inactive.');
      }
      if (errStr.includes('PollDoesNotExist') || errData.includes('0x8acdc765')) {
        throw new BadRequestException('The specified poll does not exist.');
      }

      throw new InternalServerErrorException('Contract rejected voting payload.');
    }
  }

  async isAuthority(address: string): Promise<boolean> {
    if (!this.blockchainEnabled) return false;
    try {
      return await this.reportingContract.authorizedAuthorities(address);
    } catch (error: any) {
      this.logger.error(`Failed to check authority status for address ${address}: ${error.message}`);
      return false;
    }
  }

  async startWorkOnChain(reportId: number, comment = 'Started work via Planka', imageCid = '') {
    if (!this.blockchainEnabled) return;
    try {
      this.logger.log(`Broadcasting startWork on-chain transaction for report #${reportId}...`);
      const tx = await this.reportingContract.startWork(reportId, comment, imageCid);
      await tx.wait();
      this.logger.log(`✅ Report #${reportId} status successfully transitioned to InProgress on-chain.`);
    } catch (e: any) {
      this.logger.error(`Failed to execute startWork on-chain for report #${reportId}: ${e.message}`);
    }
  }

  async markAsSolvedOnChain(reportId: number, comment = 'Marked solved via Planka', imageCid = '') {
    if (!this.blockchainEnabled) return;
    try {
      this.logger.log(`Broadcasting markAsSolved on-chain transaction for report #${reportId}...`);
      const tx = await this.reportingContract.markAsSolved(reportId, comment, imageCid);
      await tx.wait();
      this.logger.log(`✅ Report #${reportId} status successfully transitioned to PendingVerification on-chain.`);
    } catch (e: any) {
      this.logger.error(`Failed to execute markAsSolved on-chain for report #${reportId}: ${e.message}`);
    }
  }
}