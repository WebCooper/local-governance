import express, { Router } from 'express';
import { authenticate } from '../controllers/authController';

const router: Router = express.Router();

// POST /api/govid/authenticate
// Authenticate citizen and generate ZKP proof
router.post('/govid/authenticate', authenticate);

export default router;
