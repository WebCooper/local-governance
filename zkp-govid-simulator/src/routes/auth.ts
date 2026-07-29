import express, { Router } from 'express';
import { addCitizen, authenticate, getPublicKey, registerStudent } from '../controllers/authController';

const router: Router = express.Router();

// POST /api/govid/verify-citizen
// Verify citizen identity and generate ZKP proof
router.post('/govid/verify-citizen', authenticate);

// POST /api/govid/register & POST /api/govid/register-student
// Register student/user with payload signature verification
router.post('/govid/register', registerStudent);
router.post('/govid/register-student', registerStudent);

// POST /api/govid/add-citizen
// Add a new citizen to the government registry (Admin)
router.post('/govid/add-citizen', addCitizen);

router.get('/public-key', getPublicKey);

export default router;

