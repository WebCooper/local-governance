import { createCitizen } from './src/models/citizen';

try {
  const citizen = createCitizen({
    govId: 'EG/2026/9999',
    name: 'Test Student',
    password: 'password123',
    status: 'Active'
  });
  console.log('Created citizen:', citizen);
} catch (error) {
  console.error('Error in createCitizen:', error);
}
