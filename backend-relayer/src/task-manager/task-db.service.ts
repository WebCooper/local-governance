import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface TaskAssignment {
  reportId: number;
  plankaCardId: string;
  assignedWorkerAddress: string | null;
  priority: string; // 'LOW' | 'MEDIUM' | 'HIGH'
  dueDate: string | null;
}

export interface WorkerMapping {
  walletAddress: string;
  plankaUserId: string;
  name: string;
  department: string;
}

interface DbSchema {
  assignments: Record<number, TaskAssignment>;
  workers: Record<string, WorkerMapping>;
}

@Injectable()
export class TaskDbService implements OnModuleInit {
  private readonly logger = new Logger(TaskDbService.name);
  private readonly dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  private readonly dbPath = path.join(this.dataDir, 'task-assignments.json');
  private data: DbSchema = { assignments: {}, workers: {} };



  onModuleInit() {
    this.ensureDbExists();
    this.loadData();
  }

  private ensureDbExists() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.dbPath)) {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
      this.logger.log(`Created new off-chain JSON database at ${this.dbPath}`);
    }
  }

  private loadData() {
    try {
      const raw = fs.readFileSync(this.dbPath, 'utf-8');
      this.data = JSON.parse(raw);
      // Ensure structures exist
      if (!this.data.assignments) this.data.assignments = {};
      if (!this.data.workers) this.data.workers = {};
    } catch (e: any) {
      this.logger.error(`Failed to parse off-chain database: ${e.message}. Initializing empty.`);
      this.data = { assignments: {}, workers: {} };
    }
  }

  private saveData() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e: any) {
      this.logger.error(`Failed to save off-chain database: ${e.message}`);
    }
  }

  // --- Assignments ---

  getAssignment(reportId: number): TaskAssignment | undefined {
    return this.data.assignments[reportId];
  }

  getAssignmentByCardId(plankaCardId: string): TaskAssignment | undefined {
    return Object.values(this.data.assignments).find(
      (a) => a.plankaCardId === plankaCardId
    );
  }

  getAllAssignments(): TaskAssignment[] {
    return Object.values(this.data.assignments);
  }

  saveAssignment(reportId: number, assignment: Partial<TaskAssignment> & { plankaCardId: string }) {
    const existing = this.data.assignments[reportId] || {
      reportId,
      plankaCardId: assignment.plankaCardId,
      assignedWorkerAddress: null,
      priority: 'MEDIUM',
      dueDate: null,
    };

    this.data.assignments[reportId] = {
      ...existing,
      ...assignment,
    };
    this.saveData();
  }

  // --- Workers ---

  getWorker(walletAddress: string): WorkerMapping | undefined {
    return this.data.workers[walletAddress.toLowerCase()];
  }

  getWorkerByPlankaId(plankaUserId: string): WorkerMapping | undefined {
    return Object.values(this.data.workers).find(
      (w) => w.plankaUserId === plankaUserId
    );
  }

  getAllWorkers(): WorkerMapping[] {
    return Object.values(this.data.workers);
  }

  saveWorker(walletAddress: string, worker: Omit<WorkerMapping, 'walletAddress'>) {
    this.data.workers[walletAddress.toLowerCase()] = {
      walletAddress: walletAddress.toLowerCase(),
      ...worker,
    };
    this.saveData();
  }
}
