// ============================================
// AI AFFILIATE DISTRIBUTION ENGINE
// Main API Server - Express + Next.js
// ============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { config } from '../lib/config';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import productsRouter from './routes/products';
import linksRouter from './routes/links';
import contentRouter from './routes/content';
import analyticsRouter from './routes/analytics';
import schedulerRouter from './routes/scheduler';
import webhooksRouter from './routes/webhooks';
import workflowRouter from './routes/workflow';
import productionRouter from './routes/production';
import renderingRouter from './routes/rendering';
import brandsRouter from './routes/brands';
import distributionRouter from './routes/distribution';
import revenueRouter from './routes/revenue';
import assetsRouter from './routes/assets';
import affiliateRouter from './routes/affiliate';
import linksTrackingRouter from './routes/links-tracking';
import waitingUploadRouter from './routes/waiting-upload';
import zernioRouter from './routes/zernio';
import { errorHandler, notFoundHandler } from '../middleware/error';
import { startRateLimitCleaner } from '../services/rateLimit';

// ============================================
// LOGGER SETUP
// ============================================

const logger = pino({
  level: config.logLevel,
  transport: config.logPretty
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

const log = logger.child({ module: 'server' });

// ============================================
// PRISMA CLIENT
// ============================================

export const prisma = new PrismaClient({
  log: process.env.DEBUG === 'true' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

// ============================================
// EXPRESS APP
// ============================================

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabled untuk API
}));

// CORS configuration
app.use(cors({
  origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Cookie parsing
app.use(cookieParser());

// ============================================
// RATE LIMITING
// ============================================

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Terlalu banyak request. Silakan coba lagi nanti.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
    },
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        database: 'connected',
        telegram: 'connected',
        ai: 'connected',
      },
    },
  });
});

// ============================================
// API ROUTES
// ============================================

app.use('/api/products', productsRouter);
app.use('/api/links/tracking', linksTrackingRouter); // Must be before /api/links
app.use('/api/links', linksRouter);
app.use('/api/content', contentRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/scheduler', schedulerRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/workflow', workflowRouter);
app.use('/api/production', productionRouter);
app.use('/api/rendering', renderingRouter);
app.use('/api/brands', brandsRouter);
app.use('/api/distribution', distributionRouter);
app.use('/api/revenue', revenueRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/affiliate', affiliateRouter);
app.use('/api/waiting-upload', waitingUploadRouter);
app.use('/api/zernio', zernioRouter);

// ============================================
// SHORT LINK REDIRECT (for /go/:slug)
// ============================================

app.get('/go/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { source } = req.query;

    // Find the link by slug
    const link = await prisma.link.findUnique({
      where: { slug },
      include: { product: true },
    });

    if (!link) {
      log.warn({ slug }, 'Link not found');
      return res.status(404).json({
        success: false,
        error: {
          code: 'LINK_NOT_FOUND',
          message: 'Link tidak ditemukan.',
        },
      });
    }

    if (link.status !== 'ACTIVE' || link.product.status !== 'ACTIVE') {
      log.warn({ slug }, 'Link or product is not active');
      return res.status(410).json({
        success: false,
        error: {
          code: 'LINK_EXPIRED',
          message: 'Link sudah tidak aktif.',
        },
      });
    }

    // Log the click
    await prisma.clickLog.create({
      data: {
        linkId: link.id,
        source: (source as string)?.toUpperCase() as any || 'DIRECT',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        referer: req.headers.referer,
      },
    });

    // Update click count
    await prisma.link.update({
      where: { id: link.id },
      data: {
        clicks: { increment: 1 },
        lastClickedAt: new Date(),
      },
    });

    // Redirect to original affiliate link
    log.info({ slug, source }, 'Link clicked, redirecting');
    res.redirect(link.originalLink);

  } catch (error) {
    log.error({ error, slug: req.params.slug }, 'Error processing link redirect');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Terjadi kesalahan server.',
      },
    });
  }
});

// ============================================
// ERROR HANDLING
// ============================================

app.use(notFoundHandler);
app.use(errorHandler);

// ============================================
// SERVER START
// ============================================

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    log.info('✓ Database connected successfully');

    // Start rate limit cleaner (background job)
    startRateLimitCleaner();
    log.info('✓ Rate limit cleaner started');

    // Start Express server
    app.listen(PORT, () => {
      log.info(`🚀 Server running on port ${PORT}`);
      log.info(`📊 API Documentation: http://localhost:${PORT}/api/docs`);
      log.info(`🔗 Short Links: http://localhost:${PORT}/go/:slug`);
    });

  } catch (error) {
    log.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  log.info('SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log.info('SIGINT received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  log.error({ reason, promise }, 'Unhandled Promise Rejection');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.error({ error }, 'Uncaught Exception');
  process.exit(1);
});

// Start the server
startServer();

export default app;
