import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFiles,
  Logger,
  Get,
  Param,
  NotFoundException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ReportingService } from './reporting.service';
import type { SubmitReportPayload } from './reporting.service';
import { CitizenAuthGuard } from './guards/citizen-auth.guard';
import type { AuthenticatedRequest } from './guards/citizen-auth.guard';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ReportQueueService } from './queue/report-queue.service';

@Controller('report')
export class ReportingController {
  private readonly logger = new Logger(ReportingController.name);

  constructor(
    private readonly reportingService: ReportingService,
    private readonly reportQueueService: ReportQueueService,
  ) {}

  @Post()
  // Changed to FilesInterceptor to accept an array of up to 5 files under the field 'images'
  @UseInterceptors(FilesInterceptor('images', 5))
  async createReport(
    @Body() payload: SubmitReportPayload,
    @UploadedFiles() images?: Express.Multer.File[],
  ) {
    this.logger.log(
      `Received report creation request for ticket: ${payload.zkpTicketId}`,
    );

    if (images?.length) {
      this.logger.log(`Received ${images.length} image(s) with the report.`);
    }

    // Offload all the complex logic to the service layer
    const reportResult = await this.reportingService.createReport(
      payload,
      images,
    );

    return {
      success: true,
      message: 'Report queued for moderation and blockchain submission.',
      data: reportResult,
    };
  }

  /**
   * Poll this after POST /report or POST /report/vote to track progress.
   * reportId is the zkpTicketId returned in the submission/vote response.
   */
  @Get('status/:reportId')
  async getStatus(@Param('reportId') reportId: string) {
    const status = await this.reportingService.getStatus(reportId);
    if (!status) {
      throw new NotFoundException(`No report/vote found for id ${reportId}`);
    }
    return status;
  }

  @Get('my-pseudonym')
  @UseGuards(CitizenAuthGuard)
  getMyPseudonym(@Req() req: AuthenticatedRequest) {
    this.logger.log(
      `Pseudonym requested by authenticated citizen: ${req.citizen.address}`,
    );
    return this.reportingService.getPseudonym(req.citizen.address);
  }

  @Post('vote')
  async castVote(@Body() payload: CastVoteDto) {
    this.logger.log(
      `Received vote for report ${payload.reportId} in phase ${payload.votePhase}`,
    );
    return await this.reportingService.castVote(payload);
  }

  /**
   * Job counts for all three pipeline queues -- watch this while testing to
   * confirm jobs are actually moving (waiting -> active -> completed)
   * instead of piling up or failing silently.
   */
  @Get('queue-health')
  async getQueueHealth() {
    const [moderation, ipfsUpload, chainSubmit] = await Promise.all([
      this.reportQueueService.moderationQueue.getJobCounts(),
      this.reportQueueService.ipfsUploadQueue.getJobCounts(),
      this.reportQueueService.chainSubmitQueue.getJobCounts(),
    ]);

    return { moderation, ipfsUpload, chainSubmit };
  }
}
