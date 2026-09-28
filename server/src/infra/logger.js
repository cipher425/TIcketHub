import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.isTest ? 'silent' : env.isProd ? 'info' : 'debug',
  redact: ['req.headers.authorization', 'req.headers.cookie', 'password', 'passwordHash'],
  transport: !env.isProd && !env.isTest ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } : undefined,
});
