import crypto from 'crypto';
import db from '../database/db';

// Database Schema Interface
export interface Citizen {
  id: number;
  govId: string;
  password: string;
  citizenSeed: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface IssuedTicket {
  id: number;
  ticketId: string;
  signature: string;
  citizenId: number;
  status: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface NewCitizenInput {
  govId: string;
  password: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  status?: string;
}

/**
 * Get citizen by govId
 * @param govId - 12-digit government ID
 * @returns Citizen record or undefined if not found
 */
const getCitizenByGovId = (govId: string): Citizen | undefined => {
  try {
    const citizen = db
      .prepare('SELECT * FROM citizens WHERE govId = ?')
      .get(govId) as Citizen | undefined;
    return citizen;
  } catch (error) {
    console.error(`Error fetching citizen with govId ${govId}:`, error);
    return undefined;
  }
};

/**
 * Verify citizen credentials against database
 * @param govId - 12-digit government ID
 * @param password - Citizen password (typically mobile number)
 * @returns true if credentials match, false otherwise
 */
const verifyCitizen = (govId: string, password: string): boolean => {
  try {
    const citizen = getCitizenByGovId(govId);
    if (!citizen) {
      return false;
    }
    // Verify password and status
    return citizen.password === password && citizen.status === 'Active';
  } catch (error) {
    console.error('Error verifying citizen credentials:', error);
    return false;
  }
};

/**
 * Get all citizens (for admin/testing purposes)
 * @returns Array of all citizen records (without passwords)
 */
const getAllCitizens = (): Omit<Citizen, 'password'>[] => {
  try {
    const citizens = db
      .prepare('SELECT id, govId, name, email, phone, address, status, createdAt, updatedAt FROM citizens')
      .all() as Omit<Citizen, 'password'>[];
    return citizens;
  } catch (error) {
    console.error('Error fetching all citizens:', error);
    return [];
  }
};

/**
 * Persist issued signed ticket for audit and replay controls
 */
const createIssuedTicket = (
  ticketId: string,
  signature: string,
  citizenId: number,
  expiresAt: string | null
): void => {
  db.prepare(
    `
      INSERT INTO issued_tickets (ticketId, signature, citizenId, status, expiresAt)
      VALUES (?, ?, ?, 'issued', ?)
    `
  ).run(ticketId, signature, citizenId, expiresAt);
};

const getIssuedTicketById = (ticketId: string): IssuedTicket | undefined => {
  return db
    .prepare('SELECT * FROM issued_tickets WHERE ticketId = ?')
    .get(ticketId) as IssuedTicket | undefined;
};

const markIssuedTicketAsUsed = (ticketId: string): void => {
  db.prepare("UPDATE issued_tickets SET status = 'used' WHERE ticketId = ?").run(ticketId);
};

const isUniqueConstraintError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const sqliteError = error as { code?: string; message?: string };
  return (
    sqliteError.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    sqliteError.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
    sqliteError.message?.includes('UNIQUE') === true
  );
};

const createCitizen = (newCitizen: NewCitizenInput): Omit<Citizen, 'password'> => {
  const status = newCitizen.status || 'Active';
  const citizenSeed = crypto.randomBytes(32).toString('hex');

  db.prepare(
    `
      INSERT INTO citizens (govId, password, citizenSeed, name, email, phone, address, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    newCitizen.govId,
    newCitizen.password,
    citizenSeed,
    newCitizen.name,
    newCitizen.email || null,
    newCitizen.phone || null,
    newCitizen.address || null,
    status
  );

  const insertedCitizen = db
    .prepare('SELECT id, govId, citizenSeed, name, email, phone, address, status, createdAt, updatedAt FROM citizens WHERE govId = ?')
    .get(newCitizen.govId) as Omit<Citizen, 'password'> | undefined;

  if (!insertedCitizen) {
    throw new Error('Citizen insert completed but could not be fetched');
  }

  return insertedCitizen;
};

export {
  createCitizen,
  createIssuedTicket,
  getAllCitizens,
  getCitizenByGovId,
  getIssuedTicketById,
  isUniqueConstraintError,
  markIssuedTicketAsUsed,
  verifyCitizen
};
