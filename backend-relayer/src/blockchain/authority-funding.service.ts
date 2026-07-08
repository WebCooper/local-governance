import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

/**
 * Minimal ABI — only the events and functions this service needs.
 * ActionType enum: 0=AddSuperAdmin, 1=RemoveSuperAdmin, 2=AddAuthority, 3=RemoveAuthority
 */
const AUTHORITY_MULTISIG_ABI = [
  // Emitted after a proposal reaches quorum and executes
  'event ProposalExecuted(uint256 indexed proposalId, address indexed target, uint8 actionType)',
] as const;

/**
 * Action type indices as defined in AuthorityMultiSig.sol ActionType enum.
 */
const ActionType = {
  AddSuperAdmin: 0,
  RemoveSuperAdmin: 1,
  AddAuthority: 2,    // → auto-fund triggered
  RemoveAuthority: 3,
} as const;

/**
 * @description
 * Listens for ProposalExecuted events on the AuthorityMultiSig contract and
 * automatically transfers ETH to newly added Authority Worker accounts from
 * the relayer wallet (which is pre-funded via genesis.json / fund-accounts.ts).
 *
 * This keeps the multi-sig contract focused purely on access control, while
 * the funding side-effect lives here in the off-chain relayer layer.
 *
 * Configuration (add to .env):
 *   AUTHORITY_MULTISIG_ADDRESS   — deployed AuthorityMultiSig contract address
 *   FUND_AMOUNT_ETH              — ETH to top up each new worker to (default: "5.0")
 *   MINIMUM_WORKER_BALANCE_ETH   — only send funds if current balance is below this (default: "1.0")
 */
@Injectable()
export class AuthorityFundingService implements OnModuleInit {
  private readonly logger = new Logger(AuthorityFundingService.name);

  /**
   * Target balance for a new authority worker (configurable).
   * The top-up only happens if the worker's balance is BELOW the minimum threshold.
   * ETH amounts are intentionally generous since gas is near-zero on this network.
   */
  private readonly FUND_AMOUNT_ETH: string;
  private readonly MINIMUM_WORKER_BALANCE_ETH: string;

  constructor(private configService: ConfigService) {
    this.FUND_AMOUNT_ETH = this.configService.get<string>('FUND_AMOUNT_ETH') ?? '5.0';
    this.MINIMUM_WORKER_BALANCE_ETH = this.configService.get<string>('MINIMUM_WORKER_BALANCE_ETH') ?? '1.0';
  }

  onModuleInit() {
    this.initializeEventListener();
  }

  private initializeEventListener() {
    const blockchainEnabled =
      (this.configService.get<string>('BLOCKCHAIN_SUBMISSION_ENABLED') ?? 'false').toLowerCase() === 'true';

    if (!blockchainEnabled) {
      this.logger.warn('AuthorityFundingService disabled (BLOCKCHAIN_SUBMISSION_ENABLED=false).');
      return;
    }

    const rpcUrl = this.configService.get<string>('RPC_URL');
    const privateKey = this.configService.get<string>('RELAYER_PRIVATE_KEY');
    const multiSigAddress = this.configService.get<string>('AUTHORITY_MULTISIG_ADDRESS');

    if (!rpcUrl || !privateKey) {
      this.logger.error('AuthorityFundingService: RPC_URL or RELAYER_PRIVATE_KEY missing from .env.');
      return;
    }

    if (!multiSigAddress) {
      this.logger.warn(
        'AuthorityFundingService: AUTHORITY_MULTISIG_ADDRESS not set. ' +
        'Authority worker auto-funding will be disabled. Add it to .env after deployment.',
      );
      return;
    }

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const funderWallet = new ethers.Wallet(privateKey, provider);
      const multiSigContract = new ethers.Contract(multiSigAddress, AUTHORITY_MULTISIG_ABI, provider);

      this.logger.log(
        `AuthorityFundingService initialized. Listening for ProposalExecuted on ${multiSigAddress}. ` +
        `Funder wallet: ${funderWallet.address}`,
      );

      // Subscribe to ProposalExecuted events permanently for the lifetime of the service
      multiSigContract.on(
        'ProposalExecuted',
        async (proposalId: bigint, target: string, actionType: number) => {
          this.logger.log(
            `ProposalExecuted — ID: ${proposalId}, target: ${target}, actionType: ${actionType}`,
          );

          // Only act on AddAuthority proposals (actionType === 2)
          if (actionType !== ActionType.AddAuthority) {
            this.logger.debug(
              `ProposalExecuted (ID: ${proposalId}) is not AddAuthority (type=${actionType}). Skipping auto-fund.`,
            );
            return;
          }

          this.logger.log(`New Authority Worker added: ${target}. Checking balance and initiating top-up...`);
          await this.fundAuthorityWorker(funderWallet, target);
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`AuthorityFundingService failed to initialize: ${message}`);
    }
  }

  /**
   * Transfers ETH to a newly added authority worker if their balance is below
   * MINIMUM_WORKER_BALANCE_ETH. The top-up brings them up to FUND_AMOUNT_ETH.
   *
   * On a zero-gas-price permissioned network, even a small balance (0.01 ETH)
   * is enough for thousands of transactions. We set a generous default (5 ETH)
   * so workers never have to think about balance for years.
   */
  private async fundAuthorityWorker(funderWallet: ethers.Wallet, workerAddress: string) {
    try {
      const provider = funderWallet.provider!;

      const currentBalance = await provider.getBalance(workerAddress);
      const targetBalance = ethers.parseEther(this.FUND_AMOUNT_ETH);
      const minimumBalance = ethers.parseEther(this.MINIMUM_WORKER_BALANCE_ETH);

      this.logger.log(
        `Worker ${workerAddress} current balance: ${ethers.formatEther(currentBalance)} ETH. ` +
        `Minimum threshold: ${this.MINIMUM_WORKER_BALANCE_ETH} ETH.`,
      );

      if (currentBalance >= minimumBalance) {
        this.logger.log(
          `Worker ${workerAddress} already has sufficient balance. No top-up needed.`,
        );
        return;
      }

      const amountToSend = targetBalance - currentBalance;
      this.logger.log(
        `Sending ${ethers.formatEther(amountToSend)} ETH to new Authority Worker ${workerAddress}...`,
      );

      // Check funder has enough balance before attempting transfer
      const funderBalance = await provider.getBalance(funderWallet.address);
      if (funderBalance < amountToSend) {
        this.logger.error(
          `Funder wallet (${funderWallet.address}) has insufficient balance: ` +
          `${ethers.formatEther(funderBalance)} ETH. Cannot fund worker ${workerAddress}. ` +
          `Please top up the relayer/funder wallet.`,
        );
        return;
      }

      const tx = await funderWallet.sendTransaction({
        to: workerAddress,
        value: amountToSend,
        // gasPrice: 0 works on this permissioned network since --txpool.pricelimit=0
        // but we leave it unset so ethers uses network defaults (MetaMask-compatible)
      });

      this.logger.log(`Top-up transaction sent: ${tx.hash}. Waiting for confirmation...`);
      const receipt = await tx.wait();

      const newBalance = await provider.getBalance(workerAddress);
      this.logger.log(
        `✅ Authority Worker ${workerAddress} funded successfully in block ${receipt?.blockNumber}. ` +
        `New balance: ${ethers.formatEther(newBalance)} ETH.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `❌ Failed to fund Authority Worker ${workerAddress}: ${message}. ` +
        `Manual funding may be required. Use scripts/fund-accounts.ts as a reference.`,
      );
      // Do NOT rethrow — a funding failure should never crash the relayer.
    }
  }
}
