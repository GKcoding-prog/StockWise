import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AppError } from '../../common/errors/app-error';

/** A short list of passwords people actually use; rejected regardless of length. */
const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'password123',
  'motdepasse',
  'azertyuiop',
  'qwertyuiop',
  'iloveyou',
  'admin123',
  'welcome1',
  'bujumbura',
  'burundi1',
  'stockwise',
  '11111111',
  '00000000',
  'abcd1234',
]);

/** argon2id hashing (docs/01 §8). */
@Injectable()
export class PasswordService {
  /** Hash used to keep login timing similar when the email doesn't exist. */
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string | null, password: string): Promise<boolean> {
    if (!hash) {
      this.dummyHash ??= this.hash('dummy-password-for-timing');
      await argon2.verify(await this.dummyHash, password).catch(() => false);
      return false;
    }
    return argon2.verify(hash, password).catch(() => false);
  }

  /** Length is enforced by the Zod schema; this adds the common-password check. */
  assertAcceptable(password: string): void {
    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
      throw new AppError('VALIDATION_ERROR', 'This password is too common', [
        { path: 'password', code: 'too_common', message: 'This password is too common' },
      ]);
    }
  }
}
