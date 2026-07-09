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
  'function getSuperAdmins() view returns (address[])',
] as const;

const REPORTING_ABI = [
  'function getAuthorities() view returns (address[])',
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

  private provider?: ethers.JsonRpcProvider;
  private funderWallet?: ethers.Wallet;
  private multiSigContract?: ethers.Contract;
  private reportingContract?: ethers.Contract;
  private isInitialized = false;

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
    const reportingAddress = this.configService.get<string>('REPORTING_CONTRACT_ADDRESS');

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
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.funderWallet = new ethers.Wallet(privateKey, this.provider);
      this.multiSigContract = new ethers.Contract(multiSigAddress, AUTHORITY_MULTISIG_ABI, this.provider);

      if (reportingAddress) {
        this.reportingContract = new ethers.Contract(reportingAddress, REPORTING_ABI, this.provider);
      }

      this.logger.log(
        `AuthorityFundingService initialized. Listening for ProposalExecuted on ${multiSigAddress}. ` +
        `Funder wallet: ${this.funderWallet.address}`,
      );

      this.isInitialized = true;

      // Subscribe to ProposalExecuted events permanently for the lifetime of the service
      this.multiSigContract.on(
        'ProposalExecuted',
        async (proposalId: bigint, target: string, actionType: any) => {
          const actionTypeNumber = Number(actionType);
          this.logger.log(
            `ProposalExecuted — ID: ${proposalId}, target: ${target}, actionType: ${actionTypeNumber}`,
          );

          if (actionTypeNumber === ActionType.AddAuthority) {
            this.logger.log(`New Authority Worker added: ${target}. Checking balance and initiating top-up...`);
            await this.fundAccount(this.funderWallet!, target, 'Authority Worker');
          } else if (actionTypeNumber === ActionType.AddSuperAdmin) {
            this.logger.log(`New Super Admin added: ${target}. Checking balance and initiating top-up...`);
            await this.fundAccount(this.funderWallet!, target, 'Super Admin');
          } else {
            this.logger.debug(
              `ProposalExecuted (ID: ${proposalId}) is type ${actionTypeNumber}. Skipping auto-fund.`,
            );
          }
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`AuthorityFundingService failed to initialize: ${message}`);
    }
  }

  /**
   * Scans all registered Super Admins and Authorities and tops them up if their balance falls below MINIMUM_WORKER_BALANCE_ETH.
   */
  public async scanAndFundAllAccounts(): Promise<{
    funded: { address: string; amount: string; role: string }[];
    skipped: { address: string; balance: string; role: string }[];
    errors: { address: string; error: string; role: string }[];
  }> {
    const summary = {
      funded: [] as { address: string; amount: string; role: string }[],
      skipped: [] as { address: string; balance: string; role: string }[],
      errors: [] as { address: string; error: string; role: string }[],
    };

    if (!this.isInitialized || !this.funderWallet) {
      this.logger.error('scanAndFundAllAccounts: Service is not fully initialized.');
      throw new Error('Funding service is not fully initialized.');
    }

    try {
      // 1. Fetch lists from contracts
      let superAdmins: string[] = [];
      if (this.multiSigContract) {
        try {
          superAdmins = await this.multiSigContract.getSuperAdmins();
        } catch (err: any) {
          this.logger.error(`Failed to fetch super admins list: ${err.message}`);
        }
      }

      let authorities: string[] = [];
      if (this.reportingContract) {
        try {
          authorities = await this.reportingContract.getAuthorities();
        } catch (err: any) {
          this.logger.error(`Failed to fetch authorities list: ${err.message}`);
        }
      }

      this.logger.log(`Scanning balances for ${superAdmins.length} Super Admins and ${authorities.length} Authorities...`);

      // Helper to process accounts of a specific role
      const processRoleList = async (addresses: string[], role: string) => {
        for (const address of addresses) {
          if (!ethers.isAddress(address)) {
            summary.errors.push({ address, error: 'Invalid address format', role });
            continue;
          }

          try {
            const currentBalance = await this.provider!.getBalance(address);
            const targetBalance = ethers.parseEther(this.FUND_AMOUNT_ETH);
            const minimumBalance = ethers.parseEther(this.MINIMUM_WORKER_BALANCE_ETH);

            if (currentBalance >= minimumBalance) {
              summary.skipped.push({
                address,
                balance: ethers.formatEther(currentBalance),
                role,
              });
              continue;
            }

            const amountToSend = targetBalance - currentBalance;

            // Check funder balance
            const funderBalance = await this.provider!.getBalance(this.funderWallet!.address);
            if (funderBalance < amountToSend) {
              const errMsg = `Funder wallet has insufficient balance: ${ethers.formatEther(funderBalance)} ETH. Need ${ethers.formatEther(amountToSend)} ETH.`;
              this.logger.error(errMsg);
              summary.errors.push({ address, error: errMsg, role });
              continue;
            }

            this.logger.log(`Sending ${ethers.formatEther(amountToSend)} ETH to ${role} ${address}...`);
            const tx = await this.funderWallet!.sendTransaction({
              to: address,
              value: amountToSend,
            });
            await tx.wait();

            summary.funded.push({
              address,
              amount: ethers.formatEther(amountToSend),
              role,
            });
          } catch (err: any) {
            this.logger.error(`Failed processing account ${address} for role ${role}: ${err.message}`);
            summary.errors.push({ address, error: err.message, role });
          }
        }
      };

      await processRoleList(superAdmins, 'Super Admin');
      await processRoleList(authorities, 'Authority Worker');

    } catch (err: any) {
      this.logger.error(`Error during balance scanning: ${err.message}`);
      throw err;
    }

    return summary;
  }

  /**
   * Transfers ETH to a newly added account if their balance is below
   * MINIMUM_WORKER_BALANCE_ETH. The top-up brings them up to FUND_AMOUNT_ETH.
   *
   * On a zero-gas-price permissioned network, even a small balance (0.01 ETH)
   * is enough for thousands of transactions. We set a generous default (5 ETH)
   * so workers/admins never have to think about balance for years.
   */
  private async fundAccount(funderWallet: ethers.Wallet, targetAddress: string, roleName: string) {
    try {
      const provider = funderWallet.provider!;

      const currentBalance = await provider.getBalance(targetAddress);
      const targetBalance = ethers.parseEther(this.FUND_AMOUNT_ETH);
      const minimumBalance = ethers.parseEther(this.MINIMUM_WORKER_BALANCE_ETH);

      this.logger.log(
        `${roleName} ${targetAddress} current balance: ${ethers.formatEther(currentBalance)} ETH. ` +
        `Minimum threshold: ${this.MINIMUM_WORKER_BALANCE_ETH} ETH.`,
      );

      if (currentBalance >= minimumBalance) {
        this.logger.log(
          `${roleName} ${targetAddress} already has sufficient balance. No top-up needed.`,
        );
        return;
      }

      const amountToSend = targetBalance - currentBalance;
      this.logger.log(
        `Sending ${ethers.formatEther(amountToSend)} ETH to new ${roleName} ${targetAddress}...`,
      );

      // Check funder has enough balance before attempting transfer
      const funderBalance = await provider.getBalance(funderWallet.address);
      if (funderBalance < amountToSend) {
        this.logger.error(
          `Funder wallet (${funderWallet.address}) has insufficient balance: ` +
          `${ethers.formatEther(funderBalance)} ETH. Cannot fund ${roleName} ${targetAddress}. ` +
          `Please top up the relayer/funder wallet.`,
        );
        return;
      }

      const tx = await funderWallet.sendTransaction({
        to: targetAddress,
        value: amountToSend,
        // gasPrice: 0 works on this permissioned network since --txpool.pricelimit=0
        // but we leave it unset so ethers uses network defaults (MetaMask-compatible)
      });

      this.logger.log(`Top-up transaction sent: ${tx.hash}. Waiting for confirmation...`);
      const receipt = await tx.wait();

      const newBalance = await provider.getBalance(targetAddress);
      this.logger.log(
        `✅ ${roleName} ${targetAddress} funded successfully in block ${receipt?.blockNumber}. ` +
        `New balance: ${ethers.formatEther(newBalance)} ETH.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `❌ Failed to fund ${roleName} ${targetAddress}: ${message}. ` +
        `Manual funding may be required. Use scripts/fund-accounts.ts as a reference.`,
      );
      // Do NOT rethrow — a funding failure should never crash the relayer.
    }
  }
}
