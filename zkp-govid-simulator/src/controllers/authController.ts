import { Request, Response } from 'express';
import { authenticateAndGenerateProof, getAuthorityPublicKey } from '../services/authService';
import { createCitizen, isUniqueConstraintError } from '../models/citizen';

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

// POST /api/govid/add-citizen
// Add a new citizen to the government registry
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

  if (!/^\d{12}$/.test(govId)) {
    res.status(400).json({ error: 'govId must be a 12-digit numeric string.' });
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
      res.status(409).json({ error: 'A citizen with this GovID already exists.' });
      return;
    }

    console.error('Error adding citizen:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// NEW: GET /api/govid/public-key
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

// Added getPublicKey to exports
export { addCitizen, authenticate, getPublicKey };
