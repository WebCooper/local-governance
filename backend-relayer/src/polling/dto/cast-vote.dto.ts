import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CastVoteDto {
    @IsNumber()
    @IsNotEmpty()
    pollId: number;

    @IsNumber()
    @IsNotEmpty()
    optionIndex: number;

    @IsString()
    @IsNotEmpty()
    zkpTicketId: string; // Used as the unique nullifier on-chain

    @IsString()
    @IsNotEmpty()
    zkpSignature: string; // Government ticket signature

    @IsString()
    @IsNotEmpty()
    citizenPubKey: string; // Citizen's address

    @IsString()
    @IsNotEmpty()
    signature: string; // Citizen's signature over the vote data
}