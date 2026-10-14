import { describe, it } from 'node:test';
import assert from 'node:assert';
import { hashDeletionCode, verifyDeletionCode } from '../admin/deletion-code';

describe('Admin Deletion Code — Crypto Hashing & Verification', () => {
  it('hashes a code with scrypt and produces valid scrypt format', () => {
    const code = 'superSecretCode123!';
    const hashed = hashDeletionCode(code);

    assert.ok(hashed.startsWith('scrypt:'), 'Hash must start with scrypt: prefix');
    const parts = hashed.split(':');
    assert.strictEqual(parts.length, 3, 'Hash must contain prefix, salt, and key');
    assert.strictEqual(parts[1].length, 32, 'Salt must be 16 bytes hex (32 characters)');
    assert.strictEqual(parts[2].length, 128, 'Derived key must be 64 bytes hex (128 characters)');
  });

  it('correctly verifies a valid code against its hash', () => {
    const code = 'validPassword2026';
    const hashed = hashDeletionCode(code);

    const isValid = verifyDeletionCode(code, hashed);
    assert.strictEqual(isValid, true, 'Valid code must verify successfully');
  });

  it('rejects an incorrect deletion code', () => {
    const code = 'correctCode123';
    const wrongCode = 'wrongCode999';
    const hashed = hashDeletionCode(code);

    const isValid = verifyDeletionCode(wrongCode, hashed);
    assert.strictEqual(isValid, false, 'Wrong code must be rejected');
  });

  it('rejects malformed hashes gracefully without throwing', () => {
    assert.strictEqual(verifyDeletionCode('test', 'not-a-valid-hash'), false);
    assert.strictEqual(verifyDeletionCode('test', 'scrypt:short'), false);
    assert.strictEqual(verifyDeletionCode('test', ''), false);
  });
});

