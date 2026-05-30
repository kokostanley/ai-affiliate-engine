// ============================================
// AI AFFILIATE DISTRIBUTION ENGINE
// Standalone Express API Server
// ============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import 'dotenv/config';

// ============================================
// LOGGER SETUP
// ============================================

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.LOG_PRETTY === 'true'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

const log = logger.child({ module: 'api-server' });

// ============================================
// PRISMA CLIENT
// ============================================

const prisma = new PrismaClient({
  log: process.env.DEBUG === 'true' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

// ============================================
// EXPRESS APP
// ============================================

const app = express();
const PORT = process.env.PORT || 3001; // Use port 3001 to avoid conflict

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
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
  windowMs: 15 * 60 * 1000,
  max: 100,
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

// Import Phase 2 routes
import phase2Router from './app/routes/phase2';
app.use('/api/phase2', phase2Router);

// Import Production routes
import productionRouter from './app/routes/production';
app.use('/api/production', productionRouter);

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
      version: '1.0.0',
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
      aiConfigured: true,
      database: 'connected',
    },
  });
});

// ============================================
// PRODUCTS API
// ============================================

app.get('/api/products', async (req, res) => {
  try {
    const { status, category, platform, search, page = '1', limit = '20' } = req.query;

    const where: any = {};
    if (status) {
      where.status = status;
    } else {
      where.status = { not: 'ARCHIVED' };
    }
    if (category) where.category = category;
    if (platform) where.affiliatePlatform = platform;
    if (search) where.name = { contains: search as string };

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const skip = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          links: { select: { id: true, slug: true, clicks: true, status: true } },
          _count: { select: { links: true, contents: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      success: true,
      data: { products, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } },
    });
  } catch (error) {
    log.error({ error }, 'Error fetching products');
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Gagal mengambil data produk.' } });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        links: true,
        contents: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    if (!product) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Produk tidak ditemukan.' } });
    }

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Gagal mengambil data produk.' } });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { name, category, price, commission, affiliatePlatform, affiliateLink, imageUrl, description } = req.body;

    if (!name || !category || !price || !commission || !affiliatePlatform || !affiliateLink) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data tidak lengkap.' } });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/g, '');

    const commissionAmount = (price * commission) / 100;

    const product = await prisma.product.create({
      data: {
        name,
        slug,
        category,
        price,
        commission,
        commissionAmount,
        affiliatePlatform,
        affiliateLink,
        imageUrl,
        description,
        status: 'ACTIVE',
      },
    });

    await prisma.link.create({
      data: {
        slug,
        productId: product.id,
        originalLink: affiliateLink,
        status: 'ACTIVE',
      },
    });

    res.status(201).json({ success: true, data: product, message: 'Produk berhasil dibuat.' });
  } catch (error) {
    log.error({ error }, 'Error creating product');
    res.status(500).json({ success: false, error: { code: 'CREATE_ERROR', message: 'Gagal membuat produk.' } });
  }
});

// ============================================
// CONTENT API
// ============================================

app.get('/api/content', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (req.query.productId) where.productId = req.query.productId;
    if (req.query.platform) where.platform = req.query.platform;
    if (req.query.status) where.status = req.query.status;
    if (req.query.approvalStatus) where.approvalStatus = req.query.approvalStatus;

    const [contents, total] = await Promise.all([
      prisma.content.findMany({
        where,
        include: { product: { select: { id: true, name: true, slug: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.content.count({ where }),
    ]);

    res.json({ success: true, data: contents, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch content' } });
  }
});

app.get('/api/content/generate', async (req, res) => {
  try {
    const { productId } = req.query;

    if (!productId) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'productId required' } });
    }

    const product = await prisma.product.findUnique({ where: { id: productId as string } });
    if (!product) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
    }

    // Import AI functions
    const { generateContentPack, isAIConfigured } = await import('./lib/openai-content');

    if (!isAIConfigured()) {
      return res.status(503).json({ success: false, error: { code: 'AI_NOT_CONFIGURED', message: 'AI not configured' } });
    }

    const contentPack = await generateContentPack({
      productName: product.name,
      productDescription: product.description || '',
      productPrice: Number(product.price),
      productCategory: product.category,
    });

    res.json({ success: true, data: contentPack });
  } catch (error: any) {
    log.error({ error }, 'Error generating content');
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

app.post('/api/content', async (req, res) => {
  try {
    const data = req.body;

    if (!data.productId || !data.contentType || !data.platform) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' } });
    }

    const content = await prisma.content.create({
      data: {
        productId: data.productId,
        contentType: data.contentType,
        platform: data.platform,
        hook: data.hook,
        script: data.script,
        caption: data.caption,
        hashtags: typeof data.hashtags === 'string' ? data.hashtags : JSON.stringify(data.hashtags || []),
        cta: data.cta,
        telegramText: data.telegramText,
        whatsappText: data.whatsappText,
        tone: data.tone || 'casual',
        language: data.language || 'id',
        status: 'DRAFT',
        approvalStatus: 'PENDING',
      },
      include: { product: true },
    });

    res.status(201).json({ success: true, data: content });
  } catch (error) {
    log.error({ error }, 'Error creating content');
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create content' } });
  }
});

app.post('/api/content/:id/approve', async (req, res) => {
  try {
    const content = await prisma.content.update({
      where: { id: req.params.id },
      data: { approvalStatus: 'APPROVED', approvedAt: new Date() },
    });
    res.json({ success: true, data: content });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to approve' } });
  }
});

app.post('/api/content/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    const content = await prisma.content.update({
      where: { id: req.params.id },
      data: { approvalStatus: 'REJECTED', rejectedAt: new Date(), rejectionReason: reason },
    });
    res.json({ success: true, data: content });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to reject' } });
  }
});

// ============================================
// LINKS API
// ============================================

app.get('/api/links', async (req, res) => {
  try {
    const links = await prisma.link.findMany({
      include: { product: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: links });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch links' } });
  }
});

app.get('/api/links/:slug', async (req, res) => {
  try {
    const link = await prisma.link.findUnique({
      where: { slug: req.params.slug },
      include: { product: true },
    });

    if (!link) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Link not found' } });
    }

    res.json({ success: true, data: link });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch link' } });
  }
});

// Short link redirect
app.get('/go/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { source } = req.query;

    const link = await prisma.link.findUnique({
      where: { slug },
      include: { product: true },
    });

    if (!link || link.status !== 'ACTIVE' || link.product.status !== 'ACTIVE') {
      return res.status(410).json({
        success: false,
        error: { code: 'LINK_EXPIRED', message: 'Link tidak aktif.' },
      });
    }

    await prisma.clickLog.create({
      data: {
        linkId: link.id,
        source: (source as string)?.toUpperCase() || 'DIRECT',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        referer: req.headers.referer,
      },
    });

    await prisma.link.update({
      where: { id: link.id },
      data: { clicks: { increment: 1 }, lastClickedAt: new Date() },
    });

    log.info({ slug, source }, 'Link clicked, redirecting');
    res.redirect(link.originalLink);
  } catch (error) {
    log.error({ error }, 'Error processing link redirect');
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Server error' } });
  }
});

// ============================================
// ANALYTICS API
// ============================================

app.get('/api/analytics/overview', async (req, res) => {
  try {
    const [products, content, links, posts, pending] = await Promise.all([
      prisma.product.count({ where: { status: { not: 'ARCHIVED' } } }),
      prisma.content.count(),
      prisma.link.findMany({ select: { id: true, clicks: true } }),
      prisma.scheduledPost.count(),
      prisma.content.count({ where: { approvalStatus: 'PENDING' } }),
    ]);

    const totalClicks = links.reduce((sum, l) => sum + l.clicks, 0);

    res.json({
      success: true,
      data: {
        products: { total: products, active: products },
        content: { total: content, pending, approved: content - pending },
        links: { total: links.length, clicks: totalClicks },
        posts: { total: posts },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch analytics' } });
  }
});

app.get('/api/analytics/clicks', async (req, res) => {
  try {
    const logs = await prisma.clickLog.findMany({
      orderBy: { clickedAt: 'desc' },
      take: 20,
      include: { link: { select: { slug: true } } },
    });

    res.json({ success: true, data: { recent: logs } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch clicks' } });
  }
});

// ============================================
// WORKFLOW API
// ============================================

// Workflow generate endpoint
const workflowGenerateHandler = async (req: express.Request, res: express.Response) => {
  try {
    const { productId, platform, contentType, tone, language } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'productId required' } });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
    }

    const { generateContentPack, isAIConfigured } = await import('./lib/openai-content');

    if (!isAIConfigured()) {
      return res.status(503).json({ success: false, error: { code: 'AI_NOT_CONFIGURED', message: 'AI not configured' } });
    }

    const contentPack = await generateContentPack({
      productName: product.name,
      productDescription: product.description || '',
      productPrice: Number(product.price),
      productCategory: product.category,
      platform: platform || 'ALL',
    });

    const content = await prisma.content.create({
      data: {
        productId: product.id,
        contentType: contentType || 'MIXED_CONTENT',
        platform: platform || 'ALL',
        hook: contentPack.hooks[0] || '',
        script: contentPack.scripts[0] || '',
        caption: contentPack.captions[0] || '',
        hashtags: contentPack.hashtags.slice(0, 20).join(','),
        cta: contentPack.ctas[0] || '',
        telegramText: contentPack.telegramText,
        whatsappText: contentPack.whatsappText,
        tone: tone || 'casual',
        language: language || 'id',
        status: 'DRAFT',
        approvalStatus: 'PENDING',
      },
    });

    res.json({ success: true, data: { content, pack: contentPack } });
  } catch (error: any) {
    log.error({ error }, 'Error generating workflow content');
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
};

app.post('/api/workflow/generate', workflowGenerateHandler);

// ============================================
// ERROR HANDLING
// ============================================

app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.' } });
});

app.use((err: any, req: any, res: any, next: any) => {
  log.error({ error: err }, 'Unhandled error');
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Server error' } });
});

// ============================================
// SERVER START
// ============================================

async function startServer() {
  try {
    await prisma.$connect();
    log.info('✓ Database connected');

    app.listen(PORT, () => {
      log.info(`🚀 API Server running on port ${PORT}`);
      log.info(`📊 Health: http://localhost:${PORT}/health`);
      log.info(`🔗 Products: http://localhost:${PORT}/api/products`);
    });
  } catch (error) {
    log.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  log.info('Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log.info('Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();
