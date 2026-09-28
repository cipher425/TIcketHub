import { verifyAccessToken } from '../modules/auth/tokens.js';
import { User } from '../modules/users/user.model.js';
import { USER_STATUS } from '../config/constants.js';
import { forbidden, unauthorized } from '../utils/AppError.js';

function readBearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

async function resolveUser(token) {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    throw unauthorized(err.name === 'TokenExpiredError' ? 'Session expired' : 'Invalid token', 'TOKEN_INVALID');
  }
  // We re-read the user so role changes and suspensions take effect immediately,
  // instead of trusting the role baked into a still-valid token.
  const user = await User.findById(payload.sub).select('name email role status').lean();
  if (!user) throw unauthorized('Account no longer exists', 'TOKEN_INVALID');
  if (user.status !== USER_STATUS.ACTIVE) throw forbidden('Your account is suspended');
  return { id: String(user._id), name: user.name, email: user.email, role: user.role };
}

export async function requireAuth(req, _res, next) {
  const token = readBearer(req);
  if (!token) throw unauthorized();
  req.user = await resolveUser(token);
  next();
}

/** Attaches req.user if a valid token is present, but never rejects. */
export async function optionalAuth(req, _res, next) {
  const token = readBearer(req);
  if (token) {
    try {
      req.user = await resolveUser(token);
    } catch {
      req.user = undefined;
    }
  }
  next();
}

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
