# BullMQ Queue Implementation

## Overview
This document outlines the new asynchronous job queue system implemented in the backend-relayer service using BullMQ and Redis.

## Location
All queue-related code is located in:
```
backend-relayer/src/reporting/queue/
```

## Files Added

### Core Queue Service
- **`report-queue.service.ts`** - Main queue service that manages job creation and queue operations
  - Handles job enqueueing for report submissions
  - Manages queue configuration and lifecycle
  - Test file: `report-queue.service.spec.ts`

### Queue Processors
1. **`moderation.processor.ts`** - Processes AI moderation jobs
   - Validates reports through AI oracle services
   - Handles spam/safety/civic content moderation
   - Test file: `moderation.processor.spec.ts`

2. **`chain-submit.processor.ts`** - Processes blockchain submission jobs
   - Submits validated reports to smart contracts
   - Handles transaction submission and confirmation

3. **`ipfs-upload.processor.ts`** - Processes IPFS upload jobs
   - Uploads report data to IPFS network
   - Returns content hashes for storage on-chain

### Utilities
- **`redis-connection.util.ts`** - Redis connection management
  - Establishes and maintains Redis client
  - Handles connection pooling and error handling

### Interfaces
- **`report-job.interface.ts`** - TypeScript interfaces for job data structures
  - Defines shape of report job payloads
  - Type definitions for queue operations

### Status Tracking
- **`report-status.service.ts`** - Tracks report processing status
  - Monitors job progress through the queue
  - Provides status updates for front-end queries

## Queue Workflow

```
User Submission (HTTP POST)
    ↓
ReportingController validates request
    ↓
ReportQueueService enqueues job
    ↓
ModerationProcessor (AI validation)
    ↓
IPFSUploadProcessor (Store to IPFS)
    ↓
ChainSubmitProcessor (Write to blockchain)
    ↓
ReportStatusService tracks completion
```

## Integration Points

### Modified Files
- **`backend-relayer/src/reporting/reporting.controller.ts`** - Updated to use queue service
- **`backend-relayer/src/reporting/reporting.service.ts`** - Integrated with job queue
- **`backend-relayer/src/reporting/reporting.module.ts`** - Registered queue providers
- **`backend-relayer/src/reporting/cron.service.ts`** - Updated to work with queue
- **`backend-relayer/src/reporting/guards/citizen-auth.guard.ts`** - Enhanced auth for queue operations
- **`backend-relayer/src/reporting/dto/cast-vote.dto.ts`** - Updated DTOs for queue compatibility

### Dependencies Added
- Updated in `backend-relayer/package.json`:
  - `@nestjs/bull` - NestJS integration with BullMQ
  - `bull` - BullMQ library
  - `redis` - Redis client

## Testing
Test files included for:
- `report-queue.service.spec.ts` - Queue service unit tests
- `moderation.processor.spec.ts` - Moderation processor tests
- `chain-submit.processor.spec.ts` - Chain submission tests

Test script added:
- `backend-relayer/scripts/test-report-submission.js` - End-to-end queue testing

## Configuration
Redis connection is configured through:
- `redis-connection.util.ts` - Connection establishment
- Environment variables in `.env` or deployment configuration

## Benefits
✅ Asynchronous processing of reports  
✅ Scalable job handling with worker processes  
✅ Improved resilience with job retry mechanisms  
✅ Better tracking of report processing status  
✅ Decoupled services for easier maintenance  
✅ Support for multiple concurrent workers  
