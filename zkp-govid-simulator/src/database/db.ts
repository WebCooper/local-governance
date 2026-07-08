import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Initialize SQLite database
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/citizens.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema on startup
export const initializeDatabase = (): void => {
  // Create citizens and issued tickets tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS citizens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      govId TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      citizenSeed TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      status TEXT DEFAULT 'Active',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS issued_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticketId TEXT UNIQUE NOT NULL,
      signature TEXT NOT NULL,
      citizenId INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'issued',
      expiresAt DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (citizenId) REFERENCES citizens(id)
    );

    -- Create index on govId for faster lookups
    CREATE INDEX IF NOT EXISTS idx_govId ON citizens(govId);
    CREATE INDEX IF NOT EXISTS idx_ticketId ON issued_tickets(ticketId);
    CREATE INDEX IF NOT EXISTS idx_ticketStatus ON issued_tickets(status);
  `);

  console.log('✅ Database initialized successfully');
};

export default db;
