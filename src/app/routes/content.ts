// ============================================
// API ROUTES - CONTENT
// ============================================

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ============================================
// GET /api/content
// ============================================
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (req.query.productId) where.productId = req.query.productId;
    if (req.query.platform) where.platform = req.query.platform;
    if (req.query.contentType) where.contentType = req.query.contentType;
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

// ============================================
// GET /api/content/:id
// ============================================
router.get('/:id', async (req, res) => {
  try {
    const content = await prisma.content.findUnique({
      where: { id: req.params.id },
      include: { product: true, scheduledPosts: { orderBy: { scheduledAt: 'desc' } } },
    });

    if (!content) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Content not found' } });

    res.json({ success: true, data: content });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch content' } });
  }
});

// ============================================
// POST /api/content
// ============================================
router.post('/', async (req, res) => {
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
    console.error('Error creating content:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create content' } });
  }
});

// ============================================
// POST /api/content/generate (placeholder)
// ============================================
router.post('/generate', async (req, res) => {
  try {
    const { productId, platform, contentType, tone, language } = req.body;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });

    // Placeholder: AI generation would go here
    res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'AI generation not available with dummy API key' } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate content' } });
  }
});

// ============================================
// POST /api/content/approve
// ============================================
router.post('/approve', async (req, res) => {
  try {
    const { contentId } = req.body;

    const content = await prisma.content.update({
      where: { id: contentId },
      data: { approvalStatus: 'APPROVED', approvedAt: new Date() },
      include: { product: true },
    });

    res.json({ success: true, data: content });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to approve content' } });
  }
});

// ============================================
// POST /api/content/reject
// ============================================
router.post('/reject', async (req, res) => {
  try {
    const { contentId, reason } = req.body;

    const content = await prisma.content.update({
      where: { id: contentId },
      data: { approvalStatus: 'REJECTED', rejectedAt: new Date(), rejectionReason: reason },
    });

    res.json({ success: true, data: content });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to reject content' } });
  }
});

// ============================================
// DELETE /api/content/:id
// ============================================
router.delete('/:id', async (req, res) => {
  try {
    await prisma.content.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete content' } });
  }
});

// ============================================
// GET /api/content/status/pending
// ============================================
router.get('/status/pending', async (req, res) => {
  try {
    const pending = await prisma.content.findMany({
      where: { approvalStatus: 'PENDING' },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ success: true, data: pending });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch pending content' } });
  }
});

export default router;