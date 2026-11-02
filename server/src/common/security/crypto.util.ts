import { createHash, createHmac, randomBytes } from 'crypto';

export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');
export const hmacHex = (secret: string, value: string) =>
  createHmac('sha256', secret).update(value).digest('hex');
/** URL-safe random token (session ids, reset tokens). Store only its sha256 hash. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
