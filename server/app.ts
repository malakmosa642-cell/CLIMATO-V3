import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  ApiError,
  attachOptionalAuth,
  attachRequestContext,
  errorMiddleware,
  globalApiRateLimiter,
} from './middleware/requestContext.ts';
import { authRouter } from './routes/authRouter.ts';
import { platformRouter } from './routes/platformRouter.ts';
import { scienceRouter } from './routes/scienceRouter.ts';
import { v1Router } from './routes/v1Router.ts';

export interface CreateAppOptions {
  enableVite?: boolean;
  serveStaticDist?: boolean;
}

function resolveAllowedOrigins(): Set<string> {
  const allowed = new Set<string>();
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (raw) {
    for (const part of raw.split(',')) {
      const clean = part.trim().replace(/\/+$/, '');
      if (clean) allowed.add(clean);
    }
  }
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl && !appUrl.includes('MY_APP_URL')) {
    allowed.add(appUrl.replace(/\/+$/, ''));
  }
  if (process.env.NODE_ENV !== 'production') {
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:3000');
  }
  return allowed;
}

export async function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: options.enableVite
        ? false
        : {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
              imgSrc: ["'self'", 'data:', 'blob:'],
              connectSrc: [
                "'self'",
                'https://api.open-meteo.com',
                'https://geocoding-api.open-meteo.com',
                'https://cmr.earthdata.nasa.gov',
              ],
              frameAncestors: ["'self'"],
            },
          },
      hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    })
  );

  const allowedOrigins = resolveAllowedOrigins();
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        const normalized = origin.replace(/\/+$/, '');
        if (allowedOrigins.has(normalized)) {
          callback(null, true);
          return;
        }
        if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) {
          callback(null, true);
          return;
        }
        callback(
          new ApiError(
            403,
            'CORS_ORIGIN_FORBIDDEN',
            `Origin '${origin}' is not permitted by CORS policy.`
          )
        );
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Climato-Admin-Secret',
        'X-Climato-Session',
      ],
      exposedHeaders: [
        'X-Request-Id',
        'X-Climato-Engine',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'X-Climato-Org-Quota-Limit',
        'X-Climato-Org-Quota-Remaining',
        'X-Climato-Data-Provenance',
      ],
    })
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));
  app.use(attachRequestContext);
  app.use(attachOptionalAuth);
  app.use('/api', globalApiRateLimiter);

  // Modular API Routers
  app.use('/api/auth', authRouter);
  app.use('/api/science', scienceRouter);
  app.use('/api/v1', v1Router);
  app.use('/api', platformRouter);

  // Unknown API endpoints return structured JSON 404 before SPA fallback
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: {
        code: 'API_ROUTE_NOT_FOUND',
        message: `No CLIMATO API handler found for ${req.method} ${req.originalUrl}`,
      },
    });
  });

  // Centralized error serialization middleware
  app.use(errorMiddleware);

  if (options.enableVite) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (options.serveStaticDist) {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}
