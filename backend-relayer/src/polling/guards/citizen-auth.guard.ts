// src/reporting/guards/citizen-auth.guard.ts
//
// Verifies the Authorization header before any pseudonym endpoint is reached.
//
// Header format expected from the frontend:
//   Authorization: <citizenAddress>:<timestamp>:<signature>
//
// The citizen signs the canonical challenge string:
//   "get-pseudonym:<citizenAddress>:<timestamp>"
// using their Ethereum wallet (ethers.js signMessage / MetaMask personal_sign).
//
// The guard:
//   1. Parses the three parts out of the header
//   2. Rejects challenges older than CHALLENGE_TTL_MS (5 minutes)
//   3. Recovers the signer address from the signature
//   4. Confirms recovered address === claimed citizenAddress
//   5. Attaches citizenAddress to request.citizen for the controller to use

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ethers } from 'ethers';
import { Request } from 'express';

// Challenges older than this are rejected to prevent replay of captured headers.
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Augment Express Request so TypeScript knows about the citizen field
// we attach after successful auth.
export interface AuthenticatedRequest extends Request {
  citizen: {
    address: string;
  };
}

@Injectable()
export class CitizenAuthGuard implements CanActivate {
  private readonly logger = new Logger(CitizenAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authHeader = request.headers['authorization'];
    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    // ── Parse header ─────────────────────────────────────────────────────────
    // Expected: "<citizenAddress>:<timestamp>:<signature>"
    const parts = authHeader.split(':');

    // Ethereum addresses contain no colons; timestamps are plain integers;
    // but signatures (0x...) contain no colons either — so a valid header
    // has exactly 3 parts.
    if (parts.length !== 3) {
      throw new UnauthorizedException(
        'Malformed Authorization header. Expected: <address>:<timestamp>:<signature>',
      );
    }

    const [citizenAddress, timestampStr, signature] = parts;

    // ── Basic format checks ───────────────────────────────────────────────────
    if (!ethers.isAddress(citizenAddress)) {
      throw new UnauthorizedException('Invalid Ethereum address in Authorization header');
    }

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      throw new UnauthorizedException('Invalid timestamp in Authorization header');
    }

    // ── Replay / expiry check ─────────────────────────────────────────────────
    const ageMs = Date.now() - timestamp;
    if (ageMs > CHALLENGE_TTL_MS || ageMs < 0) {
      throw new UnauthorizedException(
        'Authorization challenge has expired or has a future timestamp. Re-sign and retry.',
      );
    }

    // ── Reconstruct the exact string the citizen signed ───────────────────────
    //
    // The frontend must sign this string verbatim:
    //   "get-pseudonym:<citizenAddress>:<timestamp>"
    //
    // ethers.signMessage wraps it as:
    //   "\x19Ethereum Signed Message:\n<len><message>"
    // verifyMessage handles that wrapping automatically.
    const challenge = `get-pseudonym:${citizenAddress}:${timestamp}`;

    // ── Recover signer ────────────────────────────────────────────────────────
    let recoveredAddress: string;
    try {
      recoveredAddress = ethers.verifyMessage(challenge, signature);
    } catch {
      throw new UnauthorizedException('Signature verification failed — malformed signature');
    }

    if (recoveredAddress.toLowerCase() !== citizenAddress.toLowerCase()) {
      this.logger.warn(
        `Auth failure: claimed=${citizenAddress}, recovered=${recoveredAddress}`,
      );
      throw new UnauthorizedException('Signature does not match claimed address');
    }

    // ── Attach verified identity to request ───────────────────────────────────
    request.citizen = { address: recoveredAddress };

    this.logger.log(`Citizen authenticated: ${recoveredAddress}`);
    return true;
  }
}