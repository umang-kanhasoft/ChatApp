import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import hpp from 'hpp';
import path from 'node:path';
import { corsOptions } from './config/cors.js';
import { createApiLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestContext, requestLogger } from './middleware/requestContext.js';
import { createApiRoutes } from './routes/index.js';
import { isShuttingDown } from './utils/lifecycle.js';
import { metricsHandler, metricsMiddleware } from './utils/metrics.js';

export const createApp = ({ redisClient = null } = {}) => {
  const app = express();

  app.set('trust proxy', 1);

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(helmet());
  app.use(hpp());
  app.use(compression());
  app.use(requestContext);
  app.use(requestLogger);
  app.use(metricsMiddleware);
  app.use((req, res, next) => {
    if (!isShuttingDown()) {
      next();
      return;
    }

    if (req.path === '/metrics' || req.path.startsWith('/api/health')) {
      next();
      return;
    }

    res.status(503).json({
      success: false,
      error: {
        code: 'SERVER_DRAINING',
        message: 'Server is draining connections',
        requestId: req.requestId,
      },
    });
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.get('/metrics', metricsHandler);
  app.use(createApiLimiter(redisClient));
  app.use(
    '/uploads',
    (req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(path.resolve(process.cwd(), 'uploads')),
  );

  app.get('/', (req, res) => {
    res.status(200).json({
      success: true,
      data: {
        service: 'chatapp-server',
        status: 'running',
      },
      meta: {
        requestId: req.requestId,
      },
    });
  });

  app.use('/api', createApiRoutes({ redisClient }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
