import { Module } from '@nestjs/common';
import { AiOracleService } from './ai-oracle.service';

@Module({
    providers: [AiOracleService],
    exports: [AiOracleService], // Makes the service available to importing modules
})
export class AiOracleModule { }