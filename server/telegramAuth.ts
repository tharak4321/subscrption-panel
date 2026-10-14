import crypto from 'crypto';
import { TelegramAuthPayload } from './types.js';

/**
 * Validates the authentication payload from the Telegram Login Widget
 * using Telegram's HMAC-SHA256 protocol:
 * 1. Calculate secret_key = SHA256(bot_token)
 * 2. Form data_check_string = key=value sorted alphabetically separated by \n (excluding hash)
 * 3. Calculate hmac = HMAC_SHA256(secret_key, data_check_string)
 * 4. Compare hmac with received hash in constant-time
 */
export function verifyTelegramLogin(
  payload: Record<string, any>,
  botToken: string
): { isValid: boolean; error?: string } {
  if (!botToken || botToken.trim() === '') {
    return { isValid: false, error: 'TELEGRAM_BOT_TOKEN is not configured on the server.' };
  }

  const { hash, ...dataToCheck } = payload;
  if (!hash) {
    return { isValid: false, error: 'Missing Telegram authentication hash.' };
  }

  // Check timestamp freshness (within 24 hours)
  const authDate = Number(dataToCheck.auth_date);
  if (!authDate || isNaN(authDate)) {
    return { isValid: false, error: 'Invalid or missing auth_date.' };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authDate > 86400) {
    return { isValid: false, error: 'Telegram authentication data has expired.' };
  }

  // Build the data-check-string
  const checkString = Object.keys(dataToCheck)
    .sort()
    .filter((k) => dataToCheck[k] !== undefined && dataToCheck[k] !== null)
    .map((k) => `${k}=${dataToCheck[k]}`)
    .join('\n');

  // Secret key = SHA256(bot_token)
  const secretKey = crypto.createHash('sha256').update(botToken).digest();

  // HMAC-SHA256(secret_key, data_check_string)
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex');

  // Compare hashes securely
  const isMatch = crypto.timingSafeEqual(
    Buffer.from(calculatedHash, 'utf-8'),
    Buffer.from(String(hash), 'utf-8')
  );

  if (!isMatch) {
    return { isValid: false, error: 'Cryptographic hash mismatch. Unauthorized Telegram payload.' };
  }

  return { isValid: true };
}
