import { Injectable, Logger, BadRequestException, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import { IpfsService } from '../ipfs/ipfs.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ethers } from 'ethers';

@Injectable()
export class PollingService implements OnModuleInit {
    private readonly logger = new Logger(PollingService.name);
    private govPublicKey: string = '';

    constructor(
        private readonly ipfsService: IpfsService,
        private readonly blockchainService: BlockchainService,
    ) { }

    async onModuleInit() {
        const govPublicAddress = process.env.GOV_PUBLIC_ADDRESS;
        if (!govPublicAddress) {
            const message = 'Missing GOV_PUBLIC_ADDRESS in environment configuration';
            this.logger.error(message);
            throw new Error(message);
        }
        this.govPublicKey = govPublicAddress;
    }

    async createPoll(payload: any) {
        const ipfsResult = await this.ipfsService.uploadPoll(payload);
        const tx = await this.blockchainService.createPollOnChain(
            ipfsResult.cid,
            payload.deadline,
            payload.pollType
        );
        return { success: true, pollCID: ipfsResult.cid, txHash: tx.transactionHash };
    }

    async vote(payload: CastVoteDto) {
        const { pollId, optionIndex, zkpTicketId, zkpSignature, citizenPubKey, signature } = payload;
        this.logger.log(`Processing vote relay for poll ${pollId} with nullifier protection.`);

        try {
            // 1. Verify Government Ticket (Nullifier)
            const recoveredGovAddress = ethers.verifyMessage(
                ethers.getBytes(zkpTicketId),
                zkpSignature
            );
            if (recoveredGovAddress.toLowerCase() !== this.govPublicKey.toLowerCase()) {
                throw new UnauthorizedException('Invalid government ticket for voting');
            }

            // 2. Verify Citizen Signature
            // Reconstruct the message the citizen signed on the frontend
            const messageHash = ethers.solidityPackedKeccak256(
                ['uint256', 'uint256', 'string'],
                [pollId, optionIndex, zkpTicketId]
            );

            const recoveredCitizenAddress = ethers.verifyMessage(
                ethers.getBytes(messageHash),
                signature
            );

            if (recoveredCitizenAddress.toLowerCase() !== citizenPubKey.toLowerCase()) {
                throw new UnauthorizedException('Invalid citizen signature on vote payload.');
            }

            // 3. Ensure Voter is NOT an Authority
            const isAuth = await this.blockchainService.isAuthority(citizenPubKey);
            if (isAuth) {
                throw new BadRequestException("Authorities are not permitted to vote in citizen opinion polls.");
            }

            this.logger.log(`Vote crypto-verification passed for poll ${pollId}`);

            // 4. Submit to Blockchain
            return await this.blockchainService.castPollVoteOnChain(pollId, optionIndex, zkpTicketId);
        } catch (error: any) {
            this.logger.error(`Poll vote pipeline failed: ${error.message}`);
            if (error.status) throw error;
            throw new BadRequestException('Vote verification or blockchain submission failed: ' + error.message);
        }
    }
}