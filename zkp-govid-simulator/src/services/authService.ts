import { ethers } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { getGovWallet } from '../config/govAuthority';
import { createIssuedTicket, getCitizenByGovId } from '../models/citizen';

interface AuthResult {
  success: boolean;
  error?: string;
  ticketBatch?: Array<{ ticketId: string; signature: string }>;
  citizenSeed?: string;
}

const getTicketExpiry = (): string | null => {
  const ttlSecondsRaw = process.env.TICKET_TTL_SECONDS;
  if (!ttlSecondsRaw) {
    return null;
  }

  const ttlSeconds = Number(ttlSecondsRaw);
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return null;
  }

  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
};

const getTicketBatchSize = (): number => {
  const batchRaw = process.env.TICKET_BATCH_SIZE;
  if (!batchRaw) {
    return 10;
  }

  const parsed = Number(batchRaw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }

  return Math.floor(parsed);
};

// Authenticate citizen and issue signed Ticket_ID batch
const authenticateAndGenerateProof = async (
  govId: string,
  password: string
): Promise<AuthResult> => {
  const citizen = getCitizenByGovId(govId);

  // Verify real-world identity
  if (!citizen || citizen.password !== password || citizen.status !== 'Active') {
    return {
      success: false,
      error: 'Invalid citizen credentials'
    };
  }

  const ticketBatch: Array<{ ticketId: string; signature: string }> = [];
  const batchSize = getTicketBatchSize();

  for (let i = 0; i < batchSize; i += 1) {
    const rawUuid = uuidv4();
    const ticketId = ethers.id(rawUuid);
    const signature = await getGovWallet().signMessage(ethers.getBytes(ticketId));

    createIssuedTicket(ticketId, signature, citizen.id, getTicketExpiry());
    ticketBatch.push({ ticketId, signature });
  }

  return {
    success: true,
    ticketBatch,
    citizenSeed: citizen.citizenSeed
  };
};

const getAuthorityPublicKey = (): string => {
  return getGovWallet().address;
};

const verifyRegistrationSignature = (
  payload: { govId: string; name: string; timestamp: number },
  signature: string,
  signerAddress: string
): boolean => {
  try {
    if (!signature || !signerAddress || !payload.govId || !payload.name || !payload.timestamp) {
      return false;
    }
    const message = `ZKP-GovID Registration\nGovID: ${payload.govId}\nName: ${payload.name}\nTimestamp: ${payload.timestamp}`;
    const recoveredAddress = ethers.verifyMessage(message, signature);

    // Verify recovered address matches provided signer address
    if (recoveredAddress.toLowerCase() !== signerAddress.toLowerCase()) {
      return false;
    }

    // Verify recovered address matches authorized DRP public address from environment
    const expectedDrpAddress = process.env.DRP_PUBLIC_ADDRESS;
    if (expectedDrpAddress) {
      return recoveredAddress.toLowerCase() === expectedDrpAddress.toLowerCase();
    }

    return true;
  } catch (error) {
    console.error('Error verifying registration signature:', error);
    return false;
  }
};

export { authenticateAndGenerateProof, getAuthorityPublicKey, verifyRegistrationSignature };


