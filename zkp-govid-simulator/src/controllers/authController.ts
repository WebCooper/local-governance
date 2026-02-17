import { Request, Response } from 'express';
import { authenticateAndGenerateProof } from '../services/authService';

interface AuthRequest {
  citizenId: string;
  password: string;
  reportContext: string;
}

// POST /api/govid/authenticate
// Authenticate citizen and return ZKP proof
const authenticate = (req: Request<never, never, AuthRequest>, res: Response): void => {
  const { citizenId, password, reportContext } = req.body;

  // Validate input
  if (!citizenId || !password || !reportContext) {
    res.status(400).json({
      error: "Missing required fields: citizenId, password, reportContext"
    });
    return;
  }

  // Authenticate and generate proof
  const result = authenticateAndGenerateProof(citizenId, password, reportContext);

  if (!result.success) {
    res.status(401).json({ error: result.error });
    return;
  }

  res.json({
    mockProof: result.mockProof,
    nullifierHash: result.nullifierHash
  });
};

export { authenticate };
