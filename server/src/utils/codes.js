import crypto from 'node:crypto';

// Crockford-style alphabet: no 0/O or 1/I confusion when read aloud at a counter.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function randomCode(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Human-friendly booking reference, e.g. BK-7F3K9Q2A */
export const bookingRef = () => `BK-${randomCode(8)}`;

/** 128 bits of randomness: unguessable, so the QR itself is the credential. */
export const ticketCode = () => crypto.randomBytes(16).toString('base64url');

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 60);
}
