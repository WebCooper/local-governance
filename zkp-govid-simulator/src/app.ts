import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';

const app: Express = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', authRoutes);

// Health check endpoint
app.get('/health', (req: Request, res: Response): void => {
  res.json({ status: 'ok', message: 'ZKP GovID Simulator is running' });
});

export default app;
