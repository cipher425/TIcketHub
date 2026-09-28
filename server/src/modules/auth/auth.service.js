import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { USER_STATUS } from '../../config/constants.js';
import { User } from '../users/user.model.js';
import { Session } from './session.model.js';
import { generateRefreshToken, hashToken, signAccessToken } from './tokens.js';
import { conflict, forbidden, unauthorized } from '../../utils/AppError.js';

// Used so that "unknown email" and "wrong password" take the same time (no user enumeration).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);
// Two tabs refreshing at the same moment is normal; within this window a reused token is not treated as theft.
const ROTATION_GRACE_MS = 10_000;

export const hashPassword = (password) => bcrypt.hash(password, env.BCRYPT_ROUNDS);

export async function register({ name, email, password, phone, city }) {
  if (await User.exists({ email })) throw conflict('An account with this email already exists', undefined, 'EMAIL_TAKEN');
  const passwordHash = await hashPassword(password);
  return User.create({ name, email, passwordHash, phone, city });
}

export async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const valid = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !valid) throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  if (user.status !== USER_STATUS.ACTIVE) throw forbidden('Your account is suspended');
  return user;
}

export async function issueTokens(user, meta = {}) {
  const refreshToken = generateRefreshToken();
  await Session.create({
    user: user._id,
    tokenHash: hashToken(refreshToken),
    userAgent: meta.userAgent?.slice(0, 200),
    ip: meta.ip,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
  });
  return { accessToken: signAccessToken(user), refreshToken };
}

/**
 * Refresh-token rotation: every refresh token can be used exactly once.
 * If an already-used token shows up again (outside a short grace window), someone may have
 * stolen it, so every session of that user is revoked.
 */
export async function rotateRefreshToken(token, meta = {}) {
  if (!token) throw unauthorized('No refresh token', 'REFRESH_INVALID');
  const session = await Session.findOne({ tokenHash: hashToken(token) });
  if (!session || session.expiresAt < new Date()) throw unauthorized('Session expired', 'REFRESH_INVALID');

  if (session.revokedAt) {
    if (session.rotatedAt && Date.now() - session.rotatedAt.getTime() < ROTATION_GRACE_MS) {
      throw unauthorized('Token already rotated', 'REFRESH_RACE');
    }
    await Session.updateMany({ user: session.user, revokedAt: null }, { revokedAt: new Date() });
    throw unauthorized('Session revoked', 'REFRESH_REUSED');
  }

  const now = new Date();
  // Conditional update = only one concurrent request can claim this token.
  const claimed = await Session.findOneAndUpdate({ _id: session._id, revokedAt: null }, { revokedAt: now, rotatedAt: now });
  if (!claimed) throw unauthorized('Token already rotated', 'REFRESH_RACE');

  const user = await User.findById(session.user);
  if (!user) throw unauthorized('Account no longer exists', 'REFRESH_INVALID');
  if (user.status !== USER_STATUS.ACTIVE) throw forbidden('Your account is suspended');

  return { user, ...(await issueTokens(user, meta)) };
}

export async function logout(token) {
  if (!token) return;
  await Session.updateOne({ tokenHash: hashToken(token), revokedAt: null }, { revokedAt: new Date() });
}

export async function revokeAllSessions(userId) {
  await Session.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });
}
