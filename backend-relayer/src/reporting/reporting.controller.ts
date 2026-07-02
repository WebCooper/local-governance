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
} from '@nestjs/common';
import { ExpressAdapter, FilesInterceptor } from '@nestjs/platform-express';
import { ReportingService } from './reporting.service';
import type { SubmitReportPayload } from './reporting.service';
import { CitizenAuthGuard } from './guards/citizen-auth.guard';
import type {AuthenticatedRequest} from './guards/citizen-auth.guard';
import { CastVoteDto } from './dto/cast-vote.dto';



@Controller('report')
export class ReportingController {
  private readonly logger = new Logger(ReportingController.name);

  constructor(private readonly reportingService: ReportingService) {}

  @Post()
  // Changed to FilesInterceptor to accept an array of up to 5 files under the field 'images'
  @UseInterceptors(FilesInterceptor('images', 5))
  async createReport(
    @Body() payload: SubmitReportPayload,
    @UploadedFiles() images?: Express.Multer.File[],
  ) {
    this.logger.log(`Received report creation request for ticket: ${payload.zkpTicketId}`);
    
    if (images?.length) {
      this.logger.log(`Received ${images.length} image(s) with the report.`);
    }

    // Offload all the complex logic to the service layer
    const reportResult = await this.reportingService.createReport(payload, images);

    return {
      success: true,
      message: 'Report successfully validated and accepted.',
      data: reportResult,
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