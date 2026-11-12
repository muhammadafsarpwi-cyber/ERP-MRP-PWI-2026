import * as crypto from 'crypto';

let hasWarnedMissingSecret = false;

function getEncryptionKey(): Buffer {
  const secret = process.env.AI_ENCRYPTION_SECRET || process.env.JWT_SECRET;
  if (!process.env.AI_ENCRYPTION_SECRET && !hasWarnedMissingSecret) {
    console.warn(
      '[SECURITY WARNING] AI_ENCRYPTION_SECRET is not defined in .env. Falling back to key derived from JWT_SECRET. For production security, define a dedicated 32+ character AI_ENCRYPTION_SECRET.',
    );
    hasWarnedMissingSecret = true;
  }
  const fallback = secret || 'pwi-erp-mrp-2026-default-ai-encryption-key-salt';
  return crypto.createHash('sha256').update(fallback).digest();
}

/**
 * Encrypt sensitive plain text (e.g., API keys) using AES-256-GCM.
 * Output format: iv_hex:auth_tag_hex:cipher_text_hex
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt cipher text produced by `encryptSecret`.
 */
export function decryptSecret(cipherText: string): string {
  if (!cipherText) return '';
  // If text is not encrypted in the iv:tag:payload format, return empty or safe fallback
  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    return '';
  }
  const [ivHex, tagHex, encryptedHex] = parts;
  try {
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[CryptoUtil] Failed to decrypt secret:', (err as Error).message);
    return '';
  }
}

/**
 * Mask an API key for safe UI display (e.g., "AIzaSy...9xQ2").
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey) return '';
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return '••••••••';
  }
  const prefix = trimmed.slice(0, 6);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

