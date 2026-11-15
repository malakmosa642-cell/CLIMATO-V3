import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { attachRequestContext, errorMiddleware } from './middleware/requestContext.ts';
import { platformRouter } from './routes/platformRouter.ts';
import { scienceRouter } from './routes/scienceRouter.ts';
import { v1Router } from './routes/v1Router.ts';

export interface CreateAppOptions {
  enableVite?: boolean;
  serveStaticDist?: boolean;
}

export async function createApp(options: CreateAppOptions = {}) {
  const app = express();

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(attachRequestContext);

  // Modular API Routers
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
