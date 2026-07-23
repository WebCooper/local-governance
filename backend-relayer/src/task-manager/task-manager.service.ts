import { Injectable, Logger, OnModuleInit, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { TaskDbService, TaskAssignment, WorkerMapping } from './task-db.service';
import { BlockchainService } from '../blockchain/blockchain.service';

@Injectable()
export class TaskManagerService implements OnModuleInit {
  private readonly logger = new Logger(TaskManagerService.name);
  private token: string | null = null;
  private plankaUrl = '';
  private boardId = '';
  private email = '';
  private password = '';

  // Cached list IDs from Planka
  private todoListId = '';
  private inProgressListId = '';
  private doneListId = '';

  constructor(
    private readonly configService: ConfigService,
    private readonly dbService: TaskDbService,
    private readonly blockchainService: BlockchainService,
  ) { }

  async onModuleInit() {
    this.plankaUrl = this.configService.get<string>('PLANKA_URL') || '';
    this.boardId = this.configService.get<string>('PLANKA_BOARD_ID') || '';
    this.email = this.configService.get<string>('PLANKA_EMAIL') || '';
    this.password = this.configService.get<string>('PLANKA_PASSWORD') || '';

    if (!this.plankaUrl || !this.boardId || !this.email || !this.password) {
      this.logger.warn('Planka configurations missing. Planka integration will not function.');
      return;
    }

    try {
      await this.authenticate();
      await this.discoverLists();
      this.registerContractListener();
      this.logger.log('Planka integration successfully initialized.');
    } catch (e: any) {
      this.logger.error(`Planka initialization failed: ${e.message}`);
    }
  }

  private registerContractListener() {
    try {
      const contract = this.blockchainService.getReportingContract();
      if (contract) {
        this.logger.log('Subscribing to ReportStatusChanged blockchain events...');
        contract.on('ReportStatusChanged', async (reportId, previousStatus, newStatus) => {
          this.logger.log(`Blockchain Event: ReportStatusChanged for Report #${reportId} to status ${newStatus}`);
          await this.syncReportToPlanka(
            Number(reportId),
            Number(newStatus)
          );
        });
      } else {
        this.logger.warn('Reporting contract not available yet. Retrying listener registration in 5s...');
        setTimeout(() => this.registerContractListener(), 5000);
      }
    } catch (e: any) {
      this.logger.error(`Failed to register blockchain event listener: ${e.message}`);
    }
  }


  private async authenticate() {
    const url = `${this.plankaUrl}/api/access-tokens`;
    try {
      const response = await axios.post(url, {
        emailOrUsername: this.email,
        password: this.password,
      });

      if (response.data && response.data.item) {
        this.token = response.data.item;
        this.logger.log('Successfully authenticated with Planka.');
      } else {
        throw new Error('No access token returned in response.');
      }
    } catch (e: any) {
      const errorMsg = e.response?.data?.message || e.message;
      this.logger.error(`Failed to authenticate with Planka: ${errorMsg}`);
      throw new Error(`Planka authentication failed: ${errorMsg}`);
    }
  }

  private getHeaders() {
    return {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    };
  }

  // Auto-discover the lists on the board
  private async discoverLists() {
    const url = `${this.plankaUrl}/api/boards/${this.boardId}`;
    try {
      const response = await axios.get(url, this.getHeaders());
      const lists = response.data?.included?.lists || [];

      // Look for list matching typical names (case-insensitive)
      const findList = (keywords: string[]) => {
        const list = lists.find((l: any) =>
          l.name && keywords.some((k) => l.name.toLowerCase().includes(k))
        );
        return list ? list.id : '';
      };


      this.todoListId = findList(['todo', 'to do', 'backlog', 'open', 'pending']);
      this.inProgressListId = findList(['progress', 'doing', 'active']);
      this.doneListId = findList(['done', 'completed', 'solved', 'resolved', 'verification']);

      // Fallback to indices if list names aren't recognized
      if (!this.todoListId && lists.length > 0) this.todoListId = lists[0].id;
      if (!this.inProgressListId && lists.length > 1) this.inProgressListId = lists[1].id;
      if (!this.doneListId && lists.length > 2) this.doneListId = lists[2].id;

      this.logger.log(
        `Discovered Planka Lists: ToDo=${this.todoListId}, InProgress=${this.inProgressListId}, Done=${this.doneListId}`
      );
    } catch (e: any) {
      this.logger.error(`Failed to discover Planka Board lists: ${e.message}`);
      throw e;
    }
  }


  // Helper to ensure authenticated state
  private async requestWrapper<T>(requestFn: () => Promise<T>): Promise<T> {
    try {
      return await requestFn();
    } catch (e: any) {
      // Re-authenticate on 401 Unauthorized
      if (e.response?.status === 401) {
        this.logger.warn('Token expired or unauthorized. Re-authenticating...');
        await this.authenticate();
        return await requestFn();
      }
      throw e;
    }
  }

  // --- API Methods ---

  async createCard(name: string, description: string): Promise<string> {
    if (!this.todoListId) throw new Error('ToDo list ID is not discovered.');
    const url = `${this.plankaUrl}/api/lists/${this.todoListId}/cards`;

    const card = await this.requestWrapper(async () => {
      const res = await axios.post(
        url,
        {
          name,
          description,
          type: 'project',
          position: 65536, // Explicitly define position to satisfy Planka database constraint
        },
        this.getHeaders()
      );
      return res.data?.item || res.data;
    });

    return card.id;
  }



  async updateCardList(cardId: string, onChainStatus: number): Promise<void> {
    let targetListId = '';

    // Map onchain ReportStatus enums:
    // PendingValidation(0), CommunityRejected(1), Open(2), InProgress(3), 
    // PendingRejectionReview(4), PendingVerification(5), Closed(6), Reopened(7)
    if (onChainStatus === 0 || onChainStatus === 2 || onChainStatus === 7) {
      targetListId = this.todoListId;
    } else if (onChainStatus === 3) {
      targetListId = this.inProgressListId;
    } else if (onChainStatus === 5 || onChainStatus === 6) {
      targetListId = this.doneListId;
    }

    if (!targetListId) return;

    const url = `${this.plankaUrl}/api/cards/${cardId}`;
    await this.requestWrapper(async () => {
      await axios.patch(
        url,
        {
          listId: targetListId,
        },
        this.getHeaders()
      );
    });
  }

  async getCardComments(cardId: string): Promise<any[]> {
    const url = `${this.plankaUrl}/api/cards/${cardId}/comments`;
    try {
      const res = await this.requestWrapper(async () => {
        return await axios.get(url, this.getHeaders());
      });
      const comments = res.data?.items || [];
      const users = res.data?.included?.users || [];
      return comments.map((comment: any) => {
        const user = users.find((u: any) => u.id === comment.userId);
        return {
          ...comment,
          user: user || null,
        };
      });
    } catch (e) {
      this.logger.error(`Failed to get card comments for card ${cardId}: ${e}`);
      return [];
    }
  }

  async addCardComment(cardId: string, text: string): Promise<any> {
    const url = `${this.plankaUrl}/api/cards/${cardId}/comments`;
    const comment = await this.requestWrapper(async () => {
      const res = await axios.post(url, { text }, this.getHeaders());
      return res.data;
    });
    return comment;
  }

  async getPlankaUsers(): Promise<any[]> {
    const url = `${this.plankaUrl}/api/users`;
    try {
      const res = await this.requestWrapper(async () => {
        return await axios.get(url, this.getHeaders());
      });
      return res.data?.items || res.data || [];
    } catch (e: any) {
      this.logger.error(`Failed to get Planka users: ${e.message}`);
      return [];
    }
  }


  async assignCard(cardId: string, plankaUserId: string): Promise<void> {
    // Ensure the user is a member of the board first (editor role)
    try {
      await this.requestWrapper(async () => {
        await axios.post(
          `${this.plankaUrl}/api/boards/${this.boardId}/board-memberships`,
          { userId: plankaUserId, role: 'editor' },
          this.getHeaders()
        );
      });
      this.logger.log(`Ensured Planka user ${plankaUserId} is a member of board ${this.boardId}`);
    } catch (e: any) {
      // Ignore if they are already a member or if it fails
      this.logger.log(`User board membership auto-ensure completed/skipped: ${e.message}`);
    }

    const url = `${this.plankaUrl}/api/cards/${cardId}/card-memberships`;
    await this.requestWrapper(async () => {
      await axios.post(url, { userId: plankaUserId }, this.getHeaders());
    });
  }


  async unassignCard(cardId: string, plankaUserId: string): Promise<void> {
    const url = `${this.plankaUrl}/api/cards/${cardId}/card-memberships/userId:${plankaUserId}`;
    try {
      await this.requestWrapper(async () => {
        await axios.delete(url, this.getHeaders());
      });
    } catch (e: any) {
      this.logger.error(`Failed to unassign card member: ${e.message}`);
    }
  }

  // --- Synchronize & Map report creation/status ---

  async syncReportToPlanka(
    reportId: number,
    onChainStatus: number
  ): Promise<string> {
    if (!this.plankaUrl) return '';

    let assignment = this.dbService.getAssignment(reportId);

    if (!assignment) {
      // Resolve title and description from Blockchain and IPFS
      let title = `Report #${reportId}`;
      let description = `Report ID: ${reportId}`;

      try {
        const contract = this.blockchainService.getReportingContract();
        if (contract) {
          const report = await contract.getReport(reportId);
          if (report && report.ipfsCid) {
            const rawCid = report.ipfsCid;
            const cid = rawCid.startsWith("ipfs://") ? rawCid.slice(7) : rawCid;
            const ipfsBaseUrl = this.configService.get<string>('IPFS_UPLOAD_ENDPOINT') || 'http://51.210.111.188:4000';
            
            try {
              const ipfsRes = await axios.get(`${ipfsBaseUrl}/api/ipfs/complaint/${cid}`, { timeout: 5000 });
              if (ipfsRes.data && ipfsRes.data.success) {
                const ipfsData = ipfsRes.data;
                const category = ipfsData.category || 'Civic Issue';
                title = `Report #${reportId}: ${category}`;
                
                const imagesList = ipfsData.images || [];
                let attachmentsMd = '';
                if (imagesList.length > 0) {
                  attachmentsMd = `\n\n### Attachments\n` +
                    imagesList.map((imgCid: string) => `![Report Attachment](${ipfsBaseUrl}/api/ipfs/image/${imgCid})`).join('\n\n');
                }

                description = `**Report ID**: ${reportId}\n` +
                  `**Category**: ${category}\n` +
                  `**Location**: ${ipfsData.location || 'Unknown'}\n` +
                  `**Submitted On**: ${new Date(Number(report.createdAt) * 1000).toLocaleString()}\n\n` +
                  `### Detailed Description\n${ipfsData.description || 'No description provided.'}` +
                  attachmentsMd;
              }
            } catch (ipfsErr: any) {
              this.logger.warn(`Failed to fetch IPFS data for report #${reportId} at CID ${cid}: ${ipfsErr.message}`);
            }
          }
        }
      } catch (contractErr: any) {
        this.logger.warn(`Failed to retrieve report #${reportId} from smart contract: ${contractErr.message}`);
      }

      // Create new card
      this.logger.log(`Sync: Creating Planka card for Report #${reportId}`);
      const cardId = await this.createCard(title, description);
      this.dbService.saveAssignment(reportId, {
        reportId,
        plankaCardId: cardId,
      });
      assignment = this.dbService.getAssignment(reportId);
    }

    if (assignment) {
      // Sync list column based on on-chain status
      await this.updateCardList(assignment.plankaCardId, onChainStatus);
      return assignment.plankaCardId;
    }
    return '';
  }
}
