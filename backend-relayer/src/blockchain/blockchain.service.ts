import { Injectable, OnModuleInit, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

// Monorepo Magic: Import the ABI directly from your Hardhat artifacts!
import * as ReportingArtifact from './Reporting.json';

@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);
  private provider: ethers.JsonRpcProvider;
  private relayerWallet: ethers.Wallet;
  private reportingContract: ethers.Contract;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.initializeWeb3();
  }

  private initializeWeb3() {
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
      this.logger.error(`Failed to initialize Web3: ${error.message}`);
    }
  }

  /**
   * Submits a validated report to the private blockchain.
   * This is called AFTER the Express ZKP server issues the nullifier 
   * and the AI Oracle approves the IPFS content.
   */
  async submitReportToChain(ipfsCID: string, submissionNullifier: string) {
    try {
      this.logger.log(`Initiating blockchain transaction for nullifier: ${submissionNullifier}`);
      
      // Call the createReport function on the Solidity contract
      const tx = await this.reportingContract.createReport(ipfsCID, submissionNullifier);
      
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
      this.logger.error(`Blockchain submission failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to record report on-chain.');
    }
  }
}