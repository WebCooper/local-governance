import { Request, Response } from 'express';
import {
  authenticateAndGenerateProof,
  getAuthorityPublicKey,
  verifyRegistrationSignature
} from '../services/authService';
import {
  createCitizen,
  isUniqueConstraintError,
  validateGovIdFormat
} from '../models/citizen';

interface AuthRequest {
  govId: string;
  password: string;
}

interface AddCitizenRequest {
  adminSecret: string;
  govId: string;
  password: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  status?: string;
}

interface RegisterStudentRequest {
  govId: string;
  password: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  timestamp: number;
  signature: string;
  signerAddress: string;
  secret?: string;
  adminSecret?: string;
}

// POST /api/govid/verify-citizen
// Authenticate citizen and return signed Ticket_ID batch
const authenticate = async (req: Request<never, never, AuthRequest>, res: Response): Promise<void> => {
  const { govId, password } = req.body;

  // Validate input
  if (!govId || !password) {
    res.status(400).json({
      error: 'Missing required fields: govId, password'
    });
    return;
  }

  // Authenticate and issue signed ticket batch
  const result = await authenticateAndGenerateProof(govId, password);

  if (!result.success) {
    res.status(401).json({ error: result.error });
    return;
  }

  res.json({
    success: true,
    citizenSeed: result.citizenSeed,
    ticketBatch: result.ticketBatch
  });
};

// POST /api/govid/register
// Register student/user with signed payload from frontend
const registerStudent = (req: Request<never, never, RegisterStudentRequest>, res: Response): void => {
  const { govId, password, name, email, phone, address, timestamp, signature, signerAddress, secret, adminSecret } = req.body;

  const expectedSecret = process.env.REGISTRATION_SECRET || process.env.ADMIN_SECRET;
  const providedSecret = secret || adminSecret;

  if (expectedSecret && providedSecret !== expectedSecret) {
    res.status(403).json({ error: 'Unauthorized. Invalid Registration Secret.' });
    return;
  }

  if (!govId || !password || !name) {
    res.status(400).json({ error: 'govId, password, and name are required.' });
    return;
  }

  if (!signature || !signerAddress || !timestamp) {
    res.status(400).json({ error: 'Payload signature, signerAddress, and timestamp are required for registration.' });
    return;
  }

  if (!validateGovIdFormat(govId)) {
    res.status(400).json({ error: 'govId must be a 12-digit numeric NIC or Student Register ID (e.g. EG/2021/1234).' });
    return;
  }

  // Verify signature sent by the frontend
  const isValidSignature = verifyRegistrationSignature(
    { govId, name, timestamp },
    signature,
    signerAddress
  );

  if (!isValidSignature) {
    res.status(400).json({ error: 'Payload signature verification failed. Invalid signature or signer address.' });
    return;
  }

  try {
    const citizen = createCitizen({
      govId,
      password,
      name,
      email,
      phone,
      address,
      status: 'Active'
    });

    console.log(`✅ Student registered successfully: ${citizen.name} (${citizen.govId})`);

    res.status(201).json({
      success: true,
      message: `Student ${citizen.name} registered successfully.`,
      citizen: {
        govId: citizen.govId,
        name: citizen.name,
        status: citizen.status
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'A student or citizen with this GovID/Student ID already exists.' });
      return;
    }

    console.error('Error registering student:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};


// POST /api/govid/add-citizen
// Add a new citizen to the government registry (Admin)
const addCitizen = (req: Request<never, never, AddCitizenRequest>, res: Response): void => {
  const expectedSecret = process.env.ADMIN_SECRET;

  if (!expectedSecret) {
    res.status(500).json({ error: 'Server configuration error: ADMIN_SECRET is not set' });
    return;
  }

  const { adminSecret, govId, password, name, email, phone, address, status } = req.body;

  if (!adminSecret || adminSecret !== expectedSecret) {
    res.status(403).json({ error: 'Unauthorized. Invalid Admin Secret.' });
    return;
  }

  if (!govId || !password || !name) {
    res.status(400).json({ error: 'govId, password, and name are required.' });
    return;
  }

  if (!validateGovIdFormat(govId)) {
    res.status(400).json({ error: 'govId must be a 12-digit numeric NIC or Student Register ID (e.g. EG/2021/1234).' });
    return;
  }

  if (!status || (status !== 'Active' && status !== 'Inactive')) {
    if (status) {
      res.status(400).json({ error: "status must be either 'Active' or 'Inactive'." });
      return;
    }
  }

  try {
    const citizen = createCitizen({
      govId,
      password,
      name,
      email,
      phone,
      address,
      status: status || 'Active'
    });

    console.log(`✅ New citizen added manually: ${citizen.name} (${citizen.govId})`);

    res.status(201).json({
      success: true,
      message: `Citizen ${citizen.name} added successfully.`,
      citizen: {
        govId: citizen.govId,
        name: citizen.name,
        status: citizen.status
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'A citizen with this GovID/Student ID already exists.' });
      return;
    }

    console.error('Error adding citizen:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// GET /api/govid/public-key
// Returns the public address of the Government Authority node
const getPublicKey = (req: Request, res: Response): void => {
  try {
    const address = getAuthorityPublicKey();
    res.status(200).json({
      success: true,
      authorityAddress: address,
      description: "The official public address of the Government Authority node"
    });
  } catch (error) {
    console.error('Error fetching public key:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export { addCitizen, authenticate, getPublicKey, registerStudent };

