import { Controller, Post, Body, UseInterceptors, UploadedFiles, UseGuards, ParseIntPipe } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { PollingService } from './polling.service';
import { CastVoteDto } from './dto/cast-vote.dto';
import { CitizenAuthGuard } from './guards/citizen-auth.guard'; // Reuses guard from image_4a6555.png

@Controller('polling')
export class PollingController {
    constructor(private readonly pollingService: PollingService) { }

    @Post('create')
    @UseInterceptors(FilesInterceptor('images', 5))
    async createOfficialPoll(
        @Body('title') title: string,
        @Body('description') description: string,
        @Body('pollType', ParseIntPipe) pollType: number,
        @Body('options') options: string,
        @Body('deadline', ParseIntPipe) deadline: number,
        @UploadedFiles() images: Express.Multer.File[]
    ) {
        return await this.pollingService.createPoll({
            title, description, pollType, options: JSON.parse(options), deadline, images
        });
    }

    @Post('vote')
    @UseGuards(CitizenAuthGuard) // Protects endpoint using your core auth logic
    async vote(@Body() castVoteDto: CastVoteDto) {
        return await this.pollingService.vote(castVoteDto);
    }
}