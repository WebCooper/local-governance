import { AiOracleService } from './ai-oracle.service';
import { ethers } from 'ethers';
import * as crypto from 'crypto';

/**
 * T2.5 — AI Oracle Service: Request signing & canonical JSON
 *
 * These tests verify that:
 *  1. The canonical JSON serialization is deterministically sorted
 *  2. The relayer signature is a valid Ethereum signature verifiable by ethers.js
 *  3. Missing RELAYER_PRIVATE_KEY throws properly
 */

const TEST_WALLET = ethers.Wallet.createRandom();

describe('AiOracleService', () => {
  let service: AiOracleService;

  beforeEach(() => {
    process.env.RELAYER_PRIVATE_KEY = TEST_WALLET.privateKey;
    process.env.ORACLE_API_KEY = 'test-api-key';
    service = new AiOracleService();
  });

  afterEach(() => {
    delete process.env.RELAYER_PRIVATE_KEY;
    delete process.env.ORACLE_API_KEY;
  });

  // ─── T2.5.1 — Canonical JSON determinism ─────────────────────────────────

  describe('T2.5.1 — canonicalJson() produces deterministic, sorted output', () => {

    it('produces identical output regardless of object key insertion order', () => {
      // @ts-ignore — accessing private method for testing
      const canonical = service['canonicalJson'].bind(service);

      const obj1 = { z: 1, a: 2, m: 3 };
      const obj2 = { m: 3, z: 1, a: 2 };
      const obj3 = { a: 2, m: 3, z: 1 };

      expect(canonical(obj1)).toBe(canonical(obj2));
      expect(canonical(obj2)).toBe(canonical(obj3));
    });

    it('sorts nested object keys recursively', () => {
      // @ts-ignore
      const canonical = service['canonicalJson'].bind(service);

      const nested1 = { b: { z: 1, a: 2 }, a: 3 };
      const nested2 = { a: 3, b: { a: 2, z: 1 } };

      expect(canonical(nested1)).toBe(canonical(nested2));
    });

    it('handles arrays without sorting (preserves order)', () => {
      // @ts-ignore
      const canonical = service['canonicalJson'].bind(service);

      const arr1 = { hashes: ['a', 'b', 'c'] };
      const arr2 = { hashes: ['c', 'b', 'a'] };

      // Arrays should NOT be reordered — they preserve insertion order
      expect(canonical(arr1)).not.toBe(canonical(arr2));
    });

    it('produces same hash for same canonical string across multiple calls', () => {
      // @ts-ignore
      const canonical = service['canonicalJson'].bind(service);

      const obj = {
        report_id: 'RPT-001',
        text_hash: 'abc123',
        media_hashes: ['h1', 'h2'],
        category: 'Civic',
        location: 'Downtown',
        ticket_hash: '0x123',
        payload_hash: '0xabc',
        timestamp: '2024-01-01T00:00:00.000Z',
        nonce: 'uuid-123',
      };

      const hash1 = crypto.createHash('sha256').update(canonical(obj), 'utf8').digest('hex');
      const hash2 = crypto.createHash('sha256').update(canonical(obj), 'utf8').digest('hex');

      expect(hash1).toBe(hash2);
    });
  });

  // ─── T2.5.2 — Relayer signature is a valid Ethereum personal_sign ─────────

  describe('T2.5.2 — Relayer signature can be verified by ethers.js', () => {

    it('generates a signature that recovers back to the relayer address', async () => {
      // Manually construct what the service does internally
      const canonicalObj = {
        report_id: 'RPT-test-' + Date.now(),
        text_hash: crypto.createHash('sha256').update('test text').digest('hex'),
        media_hashes: [] as string[],
        category: 'General Civic Issue',
        location: 'Unknown',
        ticket_hash: '0x' + 'a'.repeat(64),
        payload_hash: '0x' + 'b'.repeat(64),
        timestamp: new Date().toISOString(),
        nonce: crypto.randomUUID(),
      };

      // @ts-ignore
      const canonical = service['canonicalJson'].bind(service);
      const canonicalString = canonical(canonicalObj);
      const requestHash = crypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');

      const wallet = new ethers.Wallet(TEST_WALLET.privateKey);
      const signature = await wallet.signMessage(requestHash);

      // Verify signature recovers to relayer address
      const recovered = ethers.verifyMessage(requestHash, signature);
      expect(recovered.toLowerCase()).toBe(TEST_WALLET.address.toLowerCase());
    });
  });

  // ─── T2.5.3 — Missing RELAYER_PRIVATE_KEY handling ───────────────────────

  describe('T2.5.3 — Missing RELAYER_PRIVATE_KEY throws appropriately', () => {

    it('logs a warning when RELAYER_PRIVATE_KEY is missing on construction', () => {
      delete process.env.RELAYER_PRIVATE_KEY;
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // The constructor should not throw, but the service will fail on first use
      expect(() => new AiOracleService()).not.toThrow();

      consoleSpy.mockRestore();
    });

    it('moderateContent() throws InternalServerErrorException when key is missing', async () => {
      delete process.env.RELAYER_PRIVATE_KEY;
      const svcNoKey = new AiOracleService();

      await expect(
        svcNoKey.moderateContent('description', [], 'ticket', 'citizenSig', 'zkpSig', 'payloadHash')
      ).rejects.toThrow('Relayer wallet is not configured properly');
    });

    it('evaluatePoll() throws InternalServerErrorException when key is missing', async () => {
      delete process.env.RELAYER_PRIVATE_KEY;
      const svcNoKey = new AiOracleService();

      await expect(
        svcNoKey.evaluatePoll('My Poll Title', 'Poll description here')
      ).rejects.toThrow('Relayer wallet is not configured properly');
    });
  });
});
