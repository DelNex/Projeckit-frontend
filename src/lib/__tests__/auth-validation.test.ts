import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  DEPED_REGISTRATION_ERROR_MESSAGE,
  isValidDepEdEmail,
} from '../auth-validation';

describe('DepEd Registration Email Domain Restriction', () => {
  it('allows valid official DepEd emails ending in @deped.com.ph', () => {
    assert.strictEqual(isValidDepEdEmail('juan.delacruz@deped.com.ph'), true);
    assert.strictEqual(isValidDepEdEmail('teacher.name@deped.com.ph'), true);
    assert.strictEqual(isValidDepEdEmail('maria.santos123@deped.com.ph'), true);
    assert.strictEqual(isValidDepEdEmail('JUAN.DELACRUZ@DEPED.COM.PH'), true); // case-insensitive
  });

  it('rejects public email domains (gmail, yahoo, etc.)', () => {
    assert.strictEqual(isValidDepEdEmail('example@gmail.com'), false);
    assert.strictEqual(isValidDepEdEmail('example@yahoo.com'), false);
    assert.strictEqual(isValidDepEdEmail('teacher@outlook.com'), false);
    assert.strictEqual(isValidDepEdEmail('admin@hotmail.com'), false);
  });

  it('rejects other school domains that do not end in @deped.com.ph', () => {
    assert.strictEqual(isValidDepEdEmail('example@school.edu.ph'), false);
    assert.strictEqual(isValidDepEdEmail('user@deped.gov.ph'), false);
    assert.strictEqual(isValidDepEdEmail('user@school.deped.ph'), false);
    assert.strictEqual(isValidDepEdEmail('user@sub.deped.com.ph'), false);
  });

  it('rejects malformed or empty email addresses', () => {
    assert.strictEqual(isValidDepEdEmail(''), false);
    assert.strictEqual(isValidDepEdEmail(null as any), false);
    assert.strictEqual(isValidDepEdEmail(undefined as any), false);
    assert.strictEqual(isValidDepEdEmail('@deped.com.ph'), false);
    assert.strictEqual(isValidDepEdEmail('not-an-email'), false);
  });

  it('has the exact required DepEd registration error message', () => {
    assert.strictEqual(
      DEPED_REGISTRATION_ERROR_MESSAGE,
      'Registration is restricted to official DepEd email addresses ending in @deped.com.ph.'
    );
  });
});
