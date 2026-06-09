// ============================================
// AFFILIATE LINK API ROUTES
// Link generation and tracking
// ============================================

import { Router } from 'express';
import {
  generateDistributionLinks,
  generateShortCode,
  getTrackingStats,
  recordClick,
  recordLead,
  recordSale,
  formatLinkForPlatform,
} from '../../services/affiliate-link';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ============================================
// GET /api/affiliate/generate
// Generate tracking link for a distribution item
// ============================================

router.post('/generate', async (req, res) => {
  try {
    const { distributionId } = req.body;

    if (!distributionId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'distributionId is required' }
      });
    }

    const result = await generateDistributionLinks(distributionId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'GENERATE_ERROR', message: result.error }
      });
    }

    res.json({
      success: true,
      data: {
        affiliateLink: result.affiliateLink,
        trackingLink: result.trackingLink,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/affiliate/:distributionId
// Get tracking stats for a distribution item
// ============================================

router.get('/:distributionId', async (req, res) => {
  try {
    const stats = await getTrackingStats(req.params.distributionId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/affiliate/:distributionId/click
// Record a click
// ============================================

router.post('/:distributionId/click', async (req, res) => {
  try {
    const { isUnique } = req.body;

    await recordClick(req.params.distributionId, isUnique || false);

    res.json({
      success: true,
      message: 'Click recorded'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/affiliate/:distributionId/lead
// Record a lead
// ============================================

router.post('/:distributionId/lead', async (req, res) => {
  try {
    await recordLead(req.params.distributionId);

    res.json({
      success: true,
      message: 'Lead recorded'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/affiliate/:distributionId/sale
// Record a sale
// ============================================

router.post('/:distributionId/sale', async (req, res) => {
  try {
    const { revenue, commission } = req.body;

    if (revenue === undefined || commission === undefined) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'revenue and commission are required' }
      });
    }

    await recordSale(req.params.distributionId, revenue, commission);

    res.json({
      success: true,
      message: 'Sale recorded'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/affiliate/format
// Format link for specific platform
// ============================================

router.post('/format', async (req, res) => {
  try {
    const { link, platform } = req.body;

    if (!link || !platform) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'link and platform are required' }
      });
    }

    const formatted = formatLinkForPlatform(link, platform);

    res.json({
      success: true,
      data: { formattedLink: formatted },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/affiliate/links/:brandId
// Get all links for a brand
// ============================================

router.get('/links/:brandId', async (req, res) => {
  try {
    const { platform, status } = req.query;

    const where: any = { brandId: req.params.brandId };
    if (platform) where.platform = platform;
    if (status) where.status = status;

    const links = await prisma.distributionQueue.findMany({
      where,
      select: {
        id: true,
        platform: true,
        affiliateLink: true,
        trackingLink: true,
        clicks: true,
        uniqueClicks: true,
        leads: true,
        sales: true,
        conversionRate: true,
        revenue: true,
        status: true,
        createdAt: true,
        postedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({
      success: true,
      data: links,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

export default router;