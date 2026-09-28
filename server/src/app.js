import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './infra/logger.js';
import routes from './routes.js';
import { razorpayWebhookHandler } from './modules/payments/payments.routes.js';
import { apiLimiter } from './middleware/rateLimits.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/** Builds the Express app without listening, so tests can import it directly. */
export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Render/Railway/Nginx: real client IP for rate limiting
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.headers['x-request-id'] || crypto.randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
    })
  );
  app.use(helmet());
  app.use(cors({ origin: env.clientOrigins, credentials: true }));

  // Webhooks need the RAW body for signature verification, so this route is registered
  // before express.json() parses (and changes) the body.
  app.post('/api/v1/payments/webhooks/razorpay', express.raw({ type: 'application/json', limit: '1mb' }), razorpayWebhookHandler);

  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  app.get('/api/v1/health', (_req, res) =>
    res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'up' : 'down', uptime: process.uptime() })
  );

  app.use('/api/v1', apiLimiter, routes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
