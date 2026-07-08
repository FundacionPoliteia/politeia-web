import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import { attachRequestContext, requireAnyRole, requireAuth, requireRole } from './auth.js';
import { requireGoogleCloudCredentials } from './cloudCredentials.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { authRouter } from './routes/auth.js';
import { categoriesRouter } from './routes/categories.js';
import { importRouter } from './routes/import.js';
import { mediaRouter } from './routes/media.js';
import { notificationsRouter } from './routes/notifications.js';
import { postsRouter } from './routes/posts.js';
import { usersRouter } from './routes/users.js';
import { openApiSpec } from './openapi.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  const corsOptions = {
    origin: corsOrigin,
    credentials: true,
    optionsSuccessStatus: 204,
  };

  app.disable('x-powered-by');
  app.use(attachRequestContext);
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));

  const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.get('/healthz', (req, res) => {
    res.json({ ok: true, service: 'politeia-blog-api' });
  });

  app.use('/docs', requireAuth, swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.get('/openapi.json', requireAuth, (req, res) => res.json(openApiSpec));

  app.use('/v1/auth', writeLimiter, authRouter);
  app.use('/v1/categories', requireGoogleCloudCredentials, categoriesRouter({ writeLimiter }));
  app.use('/v1/posts', requireGoogleCloudCredentials, postsRouter({ writeLimiter }));
  app.use('/v1/users', requireGoogleCloudCredentials, usersRouter({ writeLimiter }));
  app.use('/v1/media', writeLimiter, requireAuth, requireAnyRole(['blog', 'reviewer']), requireGoogleCloudCredentials, mediaRouter);
  app.use('/v1/import', writeLimiter, requireAuth, requireAnyRole(['blog', 'reviewer']), requireGoogleCloudCredentials, importRouter);
  app.use('/v1/notifications', requireGoogleCloudCredentials, notificationsRouter({ writeLimiter }));

  app.get('/v1/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function corsOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  if (allowedOrigins().includes(origin)) return callback(null, origin);
  if ((config.nodeEnv !== 'production' || config.devAuth) && isLocalDevelopmentOrigin(origin)) {
    return callback(null, origin);
  }
  return callback(null, false);
}

function allowedOrigins() {
  return config.allowedOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isLocalDevelopmentOrigin(origin) {
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return ['localhost', '127.0.0.1', 'admin.localhost'].includes(url.hostname);
  } catch (_err) {
    return false;
  }
}
