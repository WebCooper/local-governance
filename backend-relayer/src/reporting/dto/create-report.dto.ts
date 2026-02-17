import { IsString, IsNotEmpty } from 'class-validator';

export class CreateReportDto {
  // --- 1. Report Content (For IPFS & AI Moderation) ---
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  location: string; // e.g., GPS coordinates "6.9271, 79.8612"

  // --- 2. Privacy & Security Payload (From ZKP Simulator) ---
  @IsString()
  @IsNotEmpty()
  mockProof: string; // Proves the user is a verified citizen

  @IsString()
  @IsNotEmpty()
  nullifierHash: string; // The unique fingerprint to prevent duplicate submissions
}
