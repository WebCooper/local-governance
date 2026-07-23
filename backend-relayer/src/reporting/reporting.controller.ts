import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFiles,
  Logger,
  Get,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ReportingService } from './reporting.service';
import type { SubmitReportPayload } from './reporting.service';
import { CitizenAuthGuard } from './guards/citizen-auth.guard';
import type { AuthenticatedRequest } from './guards/citizen-auth.guard';
import { CastVoteDto } from './dto/cast-vote.dto';



@Controller('report')
export class ReportingController {
  private readonly logger = new Logger(ReportingController.name);

  constructor(private readonly reportingService: ReportingService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED) // 202 — accepted for background processing
  @UseInterceptors(FilesInterceptor('images', 5))
  async createReport(
    @Body() payload: SubmitReportPayload,
    @UploadedFiles() images?: Express.Multer.File[],
  ) {
    this.logger.log(`Received report creation request for ticket: ${payload.zkpTicketId}`);

    if (images?.length) {
      this.logger.log(`Received ${images.length} image(s) with the report.`);
    }

    // Crypto verification (fast) then enqueue background job
    const { jobId } = await this.reportingService.validateAndEnqueue(payload, images);

    return {
      success: true,
      message: 'Report accepted for background processing.',
      jobId,
      status: 'pending',
    };
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
    this.logger.log(`Received vote for report ${payload.reportId} in phase ${payload.votePhase}`);
    return await this.reportingService.castVote(payload);
  }
}