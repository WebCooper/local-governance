import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ethers } from 'ethers';
import * as crypto from 'crypto';

export interface AiModerationResponse {
  success: boolean;
  isApproved: boolean;
  reason?: string;
}

@Injectable()
export class AiOracleService {
  private readonly logger = new Logger(AiOracleService.name);
  private readonly endpoint = 'https://ai-oracle.internalbuildtools.online/moderate/report';
  
  private readonly apiKey = process.env.ORACLE_API_KEY || 'default-api-key';
  
  // 1. FIX: Provide a strict fallback or handle the undefined type properly
  private readonly relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY || '';

  private canonicalJson(value: any): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    }

    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${this.canonicalJson(value[key])}`)
        .join(',') +
      '}'
    );
  }

  constructor() {
    if (!this.relayerPrivateKey) {
      this.logger.warn('RELAYER_PRIVATE_KEY is missing from environment variables!');
    }
  }

  async moderateContent(
    description: string,
    images: Express.Multer.File[] = [],
    zkpTicketId: string,
    citizenSignature: string,
    zkpSignature: string,
    payloadHash: string,
  ): Promise<AiModerationResponse> {
    this.logger.log('Preparing payload for AI Moderation Oracle...');

    if (!this.relayerPrivateKey) {
      throw new InternalServerErrorException('Relayer wallet is not configured properly.');
    }

    const reportId = `RPT-${crypto.randomUUID()}`;
    const nonce = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    
    const category = 'General Civic Issue';
    const location = 'Unknown';

    const textHash = crypto.createHash('sha256').update(description).digest('hex');
    const mediaHashes = images.map(img => 
      crypto.createHash('sha256').update(img.buffer).digest('hex')
    );

    const canonicalObject = {
      report_id: reportId,
      text_hash: textHash,
      media_hashes: mediaHashes,
      category,
      location,
      ticket_hash: zkpTicketId,
      payload_hash: payloadHash,
      timestamp,
      nonce,
    };

    const wallet = new ethers.Wallet(this.relayerPrivateKey);

    const canonicalString = this.canonicalJson(canonicalObject);
    const requestHash = crypto
      .createHash('sha256')
      .update(canonicalString, 'utf8')
      .digest('hex');

    const relayerSignature = await wallet.signMessage(requestHash);

    // this.logger.log(`Relayer wallet address: ${wallet.address}`);
    // this.logger.log(`Canonical string: ${canonicalString}`);
    // this.logger.log(`Request hash: ${requestHash}`);
    // this.logger.log(`Relayer signature: ${relayerSignature}`);

    const metadata = {
      report_id: reportId,
      text: description,
      category: category,
      location: location,
      ticket_hash: zkpTicketId,
      payload_hash: payloadHash,
      citizen_signature: citizenSignature,
      government_ticket_signature: zkpSignature
    };

    const requestBodyPreview = {
      metadata,
      files: images.map((img, index) => ({
        originalname: img.originalname || `image-${index}.webp`,
        mimetype: img.mimetype,
        size: img.size,
      })),
    };

    //this.logger.log(`AI Oracle request body preview: ${JSON.stringify(requestBodyPreview, null, 2)}`);

    // 3. FIX: Cast to 'any' to bypass TS DOM complaining, relying on Node 18+ globals
    const formData = new (globalThis as any).FormData();
    formData.append('metadata', JSON.stringify(metadata));

    images.forEach((img, index) => {
      const blob = new (globalThis as any).Blob([img.buffer], { type: img.mimetype });
      formData.append('files', blob, img.originalname || `image-${index}.webp`);
    });

    try {
      this.logger.log(`Dispatching request to AI Oracle (Report ID: ${reportId})`);
      
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'x-relayer-signature': relayerSignature,
          'x-request-timestamp': timestamp,
          'x-request-nonce': nonce,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Oracle responded with HTTP ${response.status}: ${errorText}`);
        throw new InternalServerErrorException('AI Moderation service failed.');
      }

      const result = await response.json();
      
      return {
        success: true,
        isApproved: result.final_decision === 'ACCEPT',
        reason: result.summary_explanation,
      };

    } catch (error: any) {
      this.logger.error(`Failed to reach AI Oracle: ${error.message}`);
      throw new InternalServerErrorException('Could not connect to AI Moderation service.');
    }
  }
}