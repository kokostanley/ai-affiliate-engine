// ============================================
// API ROUTES - SCHEDULER
// ============================================

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ============================================
// GET /api/scheduler
// ============================================
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.platform) where.platform = req.query.platform;

    const [posts, total] = await Promise.all([
      prisma.scheduledPost.findMany({
        where,
        include: { content: { select: { id: true } }, product: { select: { name: true, slug: true } } },
        orderBy: { scheduledAt: 'asc' },
        skip,
        take: limit,
      }),
      prisma.scheduledPost.count({ where }),
    ]);

    res.json({ success: true, data: posts, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch scheduled posts' } });
  }
});

// ============================================
// GET /api/scheduler/upcoming
// ============================================
router.get('/upcoming', async (req, res) => {
  try {
    const now = new Date();
    const upcoming = await prisma.scheduledPost.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { gte: now } },
      include: { content: true, product: { select: { name: true, slug: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
    });

    res.json({ success: true, data: upcoming });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch upcoming' } });
  }
});

// ============================================
// GET /api/scheduler/:id
// ============================================
router.get('/:id', async (req, res) => {
  try {
    const post = await prisma.scheduledPost.findUnique({
      where: { id: req.params.id },
      include: { content: true, product: true },
    });

    if (!post) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Scheduled post not found' } });

    res.json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch scheduled post' } });
  }
});

// ============================================
// POST /api/scheduler
// ============================================
router.post('/', async (req, res) => {
  try {
    const { contentId, platform, scheduledAt } = req.body;

    const content = await prisma.content.findUnique({ where: { id: contentId } });
    if (!content) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Content not found' } });

    if (content.approvalStatus !== 'APPROVED') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Content must be approved' } });
    }

    const post = await prisma.scheduledPost.create({
      data: {
        contentId,
        productId: content.productId,
        platform,
        scheduledAt: new Date(scheduledAt),
        status: 'SCHEDULED',
      },
      include: { content: true, product: { select: { name: true } } },
    });

    res.status(201).json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create scheduled post' } });
  }
});

// ============================================
// PATCH /api/scheduler/:id
// ============================================
router.patch('/:id', async (req, res) => {
  try {
    const { status, scheduledAt } = req.body;

    const updateData: any = {};
    if (status) updateData.status = status;
    if (scheduledAt) updateData.scheduledAt = new Date(scheduledAt);

    const post = await prisma.scheduledPost.update({
      where: { id: req.params.id },
      data: updateData,
      include: { content: true, product: { select: { name: true } } },
    });

    res.json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update scheduled post' } });
  }
});

// ============================================
// DELETE /api/scheduler/:id
// ============================================
router.delete('/:id', async (req, res) => {
  try {
    await prisma.scheduledPost.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
    res.json({ success: true, data: { cancelled: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to cancel scheduled post' } });
  }
});

export default router;