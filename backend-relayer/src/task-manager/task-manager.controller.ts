import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  BadRequestException,
  Logger,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { TaskManagerService } from './task-manager.service';
import { TaskDbService, TaskAssignment, WorkerMapping } from './task-db.service';
import { BlockchainService } from '../blockchain/blockchain.service';

interface AssignTaskDto {
  reportId: number;
  workerAddress: string;
  priority?: string;
  dueDate?: string;
}

interface AddCommentDto {
  text: string;
}

interface RegisterWorkerDto {
  walletAddress: string;
  plankaUserId: string;
  name: string;
  department: string;
}

@Controller('admin')
export class TaskManagerController {
  private readonly logger = new Logger(TaskManagerController.name);

  constructor(
    private readonly taskManagerService: TaskManagerService,
    private readonly dbService: TaskDbService,
    private readonly blockchainService: BlockchainService,
  ) {}

  @Get('tasks')
  getTasks() {
    return {
      success: true,
      data: this.dbService.getAllAssignments(),
    };
  }

  @Get('tasks/:reportId')
  getTaskByReportId(@Param('reportId') reportId: string) {
    const assignment = this.dbService.getAssignment(Number(reportId));
    return {
      success: true,
      data: assignment || null,
    };
  }

  @Post('tasks/assign')
  async assignTask(@Body() dto: AssignTaskDto) {
    const { reportId, workerAddress, priority, dueDate } = dto;
    if (!reportId || !workerAddress) {
      throw new BadRequestException('reportId and workerAddress are required.');
    }

    const worker = this.dbService.getWorker(workerAddress);
    if (!worker) {
      throw new BadRequestException(`Worker with address ${workerAddress} is not mapped to any Planka user. Please register/map the worker first.`);
    }

    let assignment = this.dbService.getAssignment(reportId);
    if (!assignment) {
      // Auto-sync/create Planka card if it doesn't exist
      const plankaCardId = await this.taskManagerService.syncReportToPlanka(
        reportId,
        2 // default: Open
      );
      if (!plankaCardId) {
        throw new BadRequestException('Could not create/sync Planka card.');
      }
      assignment = this.dbService.getAssignment(reportId);
    }

    if (assignment) {
      // If there was an old assignee, unassign them first on Planka
      if (assignment.assignedWorkerAddress && assignment.assignedWorkerAddress.toLowerCase() !== workerAddress.toLowerCase()) {
        const oldWorker = this.dbService.getWorker(assignment.assignedWorkerAddress);
        if (oldWorker) {
          await this.taskManagerService.unassignCard(assignment.plankaCardId, oldWorker.plankaUserId);
        }
      }

      // Assign on Planka
      await this.taskManagerService.assignCard(assignment.plankaCardId, worker.plankaUserId);

      // Save assignment
      this.dbService.saveAssignment(reportId, {
        reportId,
        plankaCardId: assignment.plankaCardId,
        assignedWorkerAddress: workerAddress.toLowerCase(),
        priority: priority || assignment.priority || 'MEDIUM',
        dueDate: dueDate || assignment.dueDate || null,
      });

      // Automatically move Planka card to In Progress column upon assignment
      await this.taskManagerService.syncReportToPlanka(reportId, 3);

      return {
        success: true,
        message: `Task successfully assigned to ${worker.name}`,
        data: this.dbService.getAssignment(reportId),
      };
    }

    throw new BadRequestException('Failed to assign task.');
  }

  @Get('tasks/:reportId/comments')
  async getComments(@Param('reportId') reportId: string) {
    const assignment = this.dbService.getAssignment(Number(reportId));
    if (!assignment) {
      return { success: true, data: [] };
    }
    const comments = await this.taskManagerService.getCardComments(assignment.plankaCardId);
    return {
      success: true,
      data: comments,
    };
  }

  @Post('tasks/:reportId/comments')
  async addComment(@Param('reportId') reportId: string, @Body() dto: AddCommentDto) {
    let assignment = this.dbService.getAssignment(Number(reportId));
    if (!assignment) {
      const cardId = await this.taskManagerService.syncReportToPlanka(Number(reportId), 2);
      if (cardId) {
        assignment = this.dbService.getAssignment(Number(reportId));
      }
    }
    if (!assignment) {
      throw new BadRequestException('Task is not synced to Planka.');
    }
    const comment = await this.taskManagerService.addCardComment(assignment.plankaCardId, dto.text);
    return {
      success: true,
      data: comment,
    };
  }

  // --- Worker Directory management ---

  @Get('workers')
  getWorkers() {
    return {
      success: true,
      data: this.dbService.getAllWorkers(),
    };
  }

  @Post('workers')
  registerWorker(@Body() dto: RegisterWorkerDto) {
    const { walletAddress, plankaUserId, name, department } = dto;
    if (!walletAddress || !plankaUserId || !name || !department) {
      throw new BadRequestException('Missing required fields.');
    }
    this.dbService.saveWorker(walletAddress, {
      plankaUserId,
      name,
      department,
    });
    return {
      success: true,
      message: 'Worker registered/mapped successfully.',
      data: this.dbService.getWorker(walletAddress),
    };
  }

  @Get('planka-users')
  async getPlankaUsers() {
    const users = await this.taskManagerService.getPlankaUsers();
    return {
      success: true,
      data: users,
    };
  }

  // --- Sync hook endpoint for new reports from ReportingService ---
  @Post('tasks/sync/:reportId')
  async syncReport(
    @Param('reportId') reportId: string,
    @Body() body: { status: number; description: string; category: string }
  ) {
    const plankaCardId = await this.taskManagerService.syncReportToPlanka(
      Number(reportId),
      body.status
    );
    return {
      success: true,
      cardId: plankaCardId,
    };
  }

  // --- Webhook receiver endpoint from Planka ---
  @Post('../webhooks/planka')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() payload: any, @Headers('Authorization') authHeader: string) {
    // Check webhook authorization secret if configured
    const expectedSecret = process.env.WEBHOOK_SECRET;
    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      this.logger.warn('Unauthorized Planka Webhook event received.');
      return { success: false, error: 'Unauthorized' };
    }

    const eventType = payload.event || payload.action?.type || payload.type || 'unknown';
    this.logger.log(`Received Planka webhook event [${eventType}]: ${JSON.stringify(payload)}`);

    // Flexible extraction of card object from Planka payload variations
    const card = payload.action?.data?.card || payload.data?.card || payload.card || payload.data;
    const cardId = card?.id || payload.cardId;

    if (cardId) {
      const assignment = this.dbService.getAssignmentByCardId(cardId);

      if (assignment) {
        // 1. If listId changed (card dragged to another column in Planka)
        const targetListId = card.listId || payload.data?.listId || payload.listId;
        if (targetListId) {
          const listIds = this.taskManagerService.getListIds();
          if (listIds.inProgressListId && targetListId === listIds.inProgressListId) {
            this.logger.log(`Planka Webhook: Card #${cardId} moved to InProgress. Triggering startWork on-chain for Report #${assignment.reportId}`);
            await this.blockchainService.startWorkOnChain(assignment.reportId);
          } else if (listIds.doneListId && targetListId === listIds.doneListId) {
            this.logger.log(`Planka Webhook: Card #${cardId} moved to Done. Triggering markAsSolved on-chain for Report #${assignment.reportId}`);
            await this.blockchainService.markAsSolvedOnChain(assignment.reportId);
          }
        }

        // 2. If the assignee changed in Planka, sync to local DB
        const memberships = payload.action?.data?.cardMemberships || payload.data?.cardMemberships || payload.cardMemberships;
        if (Array.isArray(memberships)) {
          if (memberships.length > 0) {
            const firstMember = memberships[0];
            const worker = this.dbService.getWorkerByPlankaId(firstMember.userId);
            if (worker) {
              assignment.assignedWorkerAddress = worker.walletAddress;
            }
          } else {
            assignment.assignedWorkerAddress = null;
          }
          this.dbService.saveAssignment(assignment.reportId, assignment);
        }
      }
    }

    return { success: true };
  }
}

