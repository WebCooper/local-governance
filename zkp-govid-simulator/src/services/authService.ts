import crypto from 'crypto';
import { verifyCitizen } from '../models/citizen';

// Generate the Simulated Proof
// This string tells the Relayer: "I mathematically verify this is a real citizen."
const generateMockProof = (): string => {
  return `zkp_valid_proof_${crypto.randomBytes(8).toString('hex')}`;
};

// Generate the Nullifier Hash
// This must be deterministic based on the user and the specific report.
// We hash the citizenId + the reportContext (e.g., "Pothole_MainSt") 
// so if they try to submit the exact same report twice, the hash is the same, 
// and the smart contract will reject it.
const generateNullifierHash = (citizenId: string, reportContext: string): string => {
  const hash = crypto.createHash('sha256');
  hash.update(citizenId + reportContext);
  return `0x${hash.digest('hex')}`;
};

interface AuthResult {
  success: boolean;
  error?: string;
  mockProof?: string;
  nullifierHash?: string;
}

// Authenticate citizen and generate ZKP payload
const authenticateAndGenerateProof = (
  citizenId: string,
  password: string,
  reportContext: string
): AuthResult => {
  // Verify real-world identity
  if (!verifyCitizen(citizenId, password)) {
    return {
      success: false,
      error: "Invalid citizen credentials"
    };
  }

  // Generate the privacy payload
  const mockProof = generateMockProof();
  const nullifierHash = generateNullifierHash(citizenId, reportContext);

  // Return the Privacy Payload
  // Notice we are NOT returning the citizen's name or ID. Privacy is preserved.
  return {
    success: true,
    mockProof: mockProof,
    nullifierHash: nullifierHash
  };
};

export { generateMockProof, generateNullifierHash, authenticateAndGenerateProof };
