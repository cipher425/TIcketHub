import * as authService from './auth.service.js';
import { REFRESH_COOKIE, refreshCookieOptions } from './tokens.js';
import { User } from '../users/user.model.js';
import { created, ok } from '../../utils/http.js';
import { notFound } from '../../utils/AppError.js';

const meta = (req) => ({ userAgent: req.get('user-agent'), ip: req.ip });

function sendSession(res, user, { accessToken, refreshToken }, status = 200) {
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  const body = { user: user.toJSON(), accessToken };
  return status === 201 ? created(res, body) : ok(res, body);
}

export async function register(req, res) {
  const user = await authService.register(req.valid.body);
  sendSession(res, user, await authService.issueTokens(user, meta(req)), 201);
}

export async function login(req, res) {
  const user = await authService.login(req.valid.body);
  sendSession(res, user, await authService.issueTokens(user, meta(req)));
}

export async function refresh(req, res) {
  const { user, ...tokens } = await authService.rotateRefreshToken(req.cookies?.[REFRESH_COOKIE], meta(req));
  sendSession(res, user, tokens);
}

export async function logout(req, res) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  const { maxAge: _maxAge, ...opts } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE, opts);
  ok(res, { loggedOut: true });
}

export async function me(req, res) {
  const user = await User.findById(req.user.id);
  if (!user) throw notFound('User');
  ok(res, user);
}
