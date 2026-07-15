import { IsString, IsNotEmpty, IsBoolean, IsIn, IsNumber } from 'class-validator';

export class CastVoteDto {
  @IsNumber()
  @IsNotEmpty()
  reportId: number;

  @IsString()
  @IsIn(['validation', 'verification', 'rejectionReview'])
  votePhase: 'validation' | 'verification' | 'rejectionReview';

  @IsBoolean()
  @IsNotEmpty()
  decision: boolean; // true = support/accept/uphold, false = reject/appeal

  @IsString()
  @IsNotEmpty()
  zkpTicketId: string; // The vote nullifier

  @IsString()
  @IsNotEmpty()
  zkpSignature: string; // Gov simulator signature

  @IsString()
  @IsNotEmpty()
  citizenPubKey: string;

  @IsString()
  @IsNotEmpty()
  signature: string; // Citizen's signature over the vote data
}