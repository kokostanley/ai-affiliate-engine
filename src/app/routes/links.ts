// ============================================
// API ROUTES - LINKS
// ============================================

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ============================================
// GET /api/links
// ============================================
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const skip = (page - 1) * limit;

    const [links, total] = await Promise.all([
      prisma.link.findMany({
        include: { product: { select: { id: true, name: true, slug: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.link.count(),
    ]);

    res.json({ success: true, data: links, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch links' } });
  }
});

// ============================================
// GET /api/links/:id
// ============================================
router.get('/:id', async (req, res) => {
  try {
    const link = await prisma.link.findUnique({
      where: { id: req.params.id },
      include: { product: true, clickLogs: { orderBy: { clickedAt: 'desc' }, take: 100 } },
    });

    if (!link) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Link not found' } });

    res.json({ success: true, data: link });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch link' } });
  }
});

// ============================================
// GET /api/links/slug/:slug
// ============================================
router.get('/slug/:slug', async (req, res) => {
  try {
    const link = await prisma.link.findUnique({
      where: { slug: req.params.slug },
      include: { product: true },
    });

    if (!link) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Link not found' } });

    res.json({ success: true, data: link });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch link' } });
  }
});

// ============================================
// POST /api/links
// ============================================
router.post('/', async (req, res) => {
  try {
    const { productId, slug, originalLink } = req.body;

    if (!productId || !slug || !originalLink) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' } });
    }

    const existing = await prisma.link.findUnique({ where: { slug } });
    if (existing) return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Slug already exists' } });

    const link = await prisma.link.create({
      data: { productId, slug, originalLink, status: 'ACTIVE' },
      include: { product: true },
    });

    res.status(201).json({ success: true, data: link });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create link' } });
  }
});

// ============================================
// PATCH /api/links/:id
// ============================================
router.patch('/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['ACTIVE', 'PAUSED', 'EXPIRED'].includes(status)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid status' } });
    }

    const link = await prisma.link.update({
      where: { id: req.params.id },
      data: { status },
      include: { product: true },
    });

    res.json({ success: true, data: link });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update link' } });
  }
});

// ============================================
// DELETE /api/links/:id
// ============================================
router.delete('/:id', async (req, res) => {
  try {
    await prisma.link.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete link' } });
  }
});

// ============================================
// GET /api/links/:id/clicks
// ============================================
router.get('/:id/clicks', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const skip = (page - 1) * limit;

    const [clicks, total] = await Promise.all([
      prisma.clickLog.findMany({ where: { linkId: req.params.id }, orderBy: { clickedAt: 'desc' }, skip, take: limit }),
      prisma.clickLog.count({ where: { linkId: req.params.id } }),
    ]);

    res.json({ success: true, data: clicks, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch clicks' } });
  }
});

export default router;